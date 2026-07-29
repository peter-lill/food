import { prisma } from "@/lib/prisma";
import { searchColesAndWoolworths } from "@/lib/prices/coles-woolworths-provider";
import { findBestProductImage } from "@/lib/products/image-intelligence";
import { assessProductImage } from "@/lib/products/image-quality";

const produceTerms = [
  "apple", "avocado", "banana", "broccoli", "carrot", "cauliflower", "capsicum",
  "cucumber", "garlic", "ginger", "lemon", "lettuce", "lime", "mushroom",
  "onion", "potato", "spinach", "sweet potato", "tomato", "zucchini",
] as const;

const genericFoodTerms = [
  ...produceTerms,
  "chicken breast", "chicken thigh", "beef mince", "pork mince", "salmon",
  "steak", "lamb chop", "rice", "flour", "sugar", "oats", "pine nuts",
] as const;

const commonsSearchQueries: Record<string, string> = {
  mushroom: "Agaricus bisporus button mushroom edible food",
  broccoli: "broccoli vegetable edible",
  "chicken breast": "raw chicken breast meat food",
  "chicken thigh": "raw chicken thigh meat food",
  "beef mince": "raw ground beef mince food",
  "pork mince": "raw ground pork mince food",
  salmon: "raw salmon fillet food",
  steak: "raw beef steak food",
  "lamb chop": "raw lamb chop food",
  rice: "uncooked rice grains food",
  "pine nuts": "pine nuts food",
};

const preferredCommonsWords: Record<string, string[]> = {
  mushroom: ["agaricus", "bisporus", "button", "champignon"],
  broccoli: ["broccoli", "vegetable"],
  "chicken breast": ["chicken", "breast", "meat"],
  "chicken thigh": ["chicken", "thigh", "meat"],
  "beef mince": ["beef", "ground", "mince"],
  "pork mince": ["pork", "ground", "mince"],
  salmon: ["salmon", "fillet"],
  steak: ["beef", "steak"],
  "lamb chop": ["lamb", "chop"],
  rice: ["rice", "grain"],
  "pine nuts": ["pine", "nuts"],
};

const unsuitableCommonsWords = [
  "diagram", "drawing", "icon", "logo", "map", "painting", "poster", "seal", "symbol",
  "schizophyllum", "fungus", "mold", "mould", "disease", "microscope", "spore",
] as const;

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function recognisedIdentity(values: string[], terms: readonly string[]) {
  const identity = normalise(values.join(" "));
  return terms.find((term) => (
    identity === term
    || identity.includes(` ${term} `)
    || identity.startsWith(`${term} `)
    || identity.endsWith(` ${term}`)
  )) ?? null;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

async function usable(url: string | null | undefined) {
  if (!url) return false;
  const assessment = await assessProductImage(url).catch(() => null);
  return Boolean(assessment?.reachable && assessment.contentType?.startsWith("image/") && assessment.score >= 35);
}

async function openFoodFactsImage(barcode: string) {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=status,code,image_front_url,image_url`,
    { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" } },
  ).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json() as { status?: number; code?: string; product?: { image_front_url?: string; image_url?: string } };
  if (payload.status === 0 || payload.code !== barcode) return null;
  return payload.product?.image_front_url ?? payload.product?.image_url ?? null;
}

type CommonsPage = {
  title?: string;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    mime?: string;
    width?: number;
    height?: number;
  }>;
};

async function wikimediaFoodImages(identity: string) {
  const query = commonsSearchQueries[identity] ?? `${identity} edible food`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "16",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "900",
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)",
    },
  }).catch(() => null);
  if (!response?.ok) return [];

  const payload = await response.json() as { query?: { pages?: Record<string, CommonsPage> } };
  const identityTerms = normalise(identity).split(" ").filter(Boolean);
  const preferredTerms = preferredCommonsWords[identity] ?? identityTerms;

  return Object.values(payload.query?.pages ?? {})
    .map((page) => {
      const info = page.imageinfo?.[0];
      const title = normalise(page.title ?? "");
      const matchedTerms = identityTerms.filter((term) => title.includes(term)).length;
      const preferredMatches = preferredTerms.filter((term) => title.includes(term)).length;
      const unsuitable = unsuitableCommonsWords.some((word) => title.includes(word));
      const landscapePenalty = info?.width && info?.height && info.width / info.height > 3 ? 1 : 0;
      return {
        url: info?.thumburl ?? info?.url ?? null,
        score: matchedTerms * 20 + preferredMatches * 25 - (unsuitable ? 140 : 0) - landscapePenalty * 20,
        mime: info?.mime ?? "",
      };
    })
    .filter((candidate) => candidate.url && candidate.mime.startsWith("image/") && candidate.score >= 25)
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.url as string);
}

export async function recoverProductImage(productId: string) {
  const primary = await findBestProductImage(productId).catch(() => null);
  if (primary?.imageUrl && await usable(primary.imageUrl)) return primary;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
      barcode: true,
      category: true,
      packSize: true,
      aliases: { select: { alias: true } },
    },
  });
  if (!product) throw new Error("Product not found.");

  const barcode = product.barcode?.replace(/\D/g, "") ?? "";
  const identityValues = unique([
    product.name,
    product.canonicalName,
    product.brand,
    product.packSize,
    product.category,
    ...product.aliases.map((alias) => alias.alias),
  ]);

  const candidates: string[] = [];
  if (/^\d{7,14}$/.test(barcode)) {
    const exact = await openFoodFactsImage(barcode);
    if (exact) candidates.push(exact);
  }

  const produceIdentity = recognisedIdentity(identityValues, produceTerms);
  const genericIdentity = recognisedIdentity(identityValues, genericFoodTerms);
  const queries = unique([
    barcode || null,
    [product.brand, product.name, product.packSize].filter(Boolean).join(" "),
    [product.brand, product.canonicalName, product.packSize].filter(Boolean).join(" "),
    product.name,
    product.canonicalName,
    ...product.aliases.map((alias) => alias.alias),
    produceIdentity,
  ]).slice(0, 10);

  for (const query of queries) {
    const results = await searchColesAndWoolworths(query).catch(() => []);
    for (const result of results) {
      if (result.imageUrl) candidates.push(result.imageUrl);
    }
  }

  if (genericIdentity) {
    candidates.push(...await wikimediaFoodImages(genericIdentity));
  }

  for (const imageUrl of unique(candidates)) {
    if (!await usable(imageUrl)) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        imageUrl,
        lifecycle: "READY",
        confidenceScore: produceIdentity ? 0.85 : genericIdentity ? 0.8 : 0.75,
      },
    });
    return { imageUrl, status: "selected" as const };
  }

  return primary ?? {
    imageUrl: null,
    status: produceIdentity ? "no-produce-match" as const : "no-exact-match" as const,
  };
}
