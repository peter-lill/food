import { prisma } from "@/lib/prisma";
import { searchColesAndWoolworths } from "@/lib/prices/coles-woolworths-provider";
import { findBestProductImage } from "@/lib/products/image-intelligence";
import { assessProductImage } from "@/lib/products/image-quality";

const produceTerms = [
  "apple", "avocado", "banana", "broccoli", "carrot", "cauliflower", "capsicum",
  "cucumber", "garlic", "ginger", "lemon", "lettuce", "lime", "mushroom",
  "onion", "potato", "spinach", "sweet potato", "tomato", "zucchini",
] as const;

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isRecognisedProduce(values: string[]) {
  const identity = normalise(values.join(" "));
  return produceTerms.some((term) => identity === term || identity.includes(` ${term} `) || identity.startsWith(`${term} `) || identity.endsWith(` ${term}`));
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

async function usable(url: string | null | undefined) {
  if (!url) return false;
  const assessment = await assessProductImage(url).catch(() => null);
  return Boolean(assessment?.reachable && assessment.contentType?.startsWith("image/") && assessment.score >= 40);
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

  const produce = isRecognisedProduce(identityValues);
  const queries = unique([
    barcode || null,
    [product.brand, product.name, product.packSize].filter(Boolean).join(" "),
    [product.brand, product.canonicalName, product.packSize].filter(Boolean).join(" "),
    product.name,
    product.canonicalName,
    ...product.aliases.map((alias) => alias.alias),
    produce ? normalise(product.name) : null,
  ]).slice(0, 10);

  for (const query of queries) {
    const results = await searchColesAndWoolworths(query).catch(() => []);
    for (const result of results) {
      if (result.imageUrl) candidates.push(result.imageUrl);
    }
  }

  for (const imageUrl of unique(candidates)) {
    if (!await usable(imageUrl)) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl, lifecycle: "READY", confidenceScore: produce ? 0.8 : 0.75 },
    });
    return { imageUrl, status: "selected" as const };
  }

  return primary ?? { imageUrl: null, status: produce ? "no-produce-match" as const : "no-exact-match" as const };
}
