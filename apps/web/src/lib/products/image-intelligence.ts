import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { searchColesAndWoolworths } from "@/lib/prices/coles-woolworths-provider";

type ImageCandidate = {
  url: string;
  source: string;
  sourceLabel: string;
  score: number;
};

type StoredCandidate = {
  url: string;
  score: number;
  rejected: boolean;
};

export function imageCandidateSourcePriority(source: string) {
  const key = source.toLocaleLowerCase("en-AU");
  if (key.includes("coles") || key.includes("woolworths") || key === "retailer") return 5;
  if (key.includes("manufacturer") || key.includes("brand site")) return 4;
  if (key.includes("open-food-facts") || key.includes("open food facts")) return 3;
  if (key.includes("wikipedia") || key.includes("wikimedia") || key.includes("catalogue")) return 2;
  return 1;
}

const gtinPattern = /^\d{7,14}$/;
const ignoredProduceWords = new Set([
  "a", "an", "and", "approx", "approximately", "bag", "bunch", "coles", "each", "fresh",
  "gold", "kg", "loose", "pack", "packet", "per", "piece", "pieces", "product", "the",
  "woolworths", "g", "gram", "grams", "kilogram", "kilograms",
]);
const ignoredPackagedWords = new Set([
  "a", "an", "and", "can", "cans", "case", "drink", "each", "multipack", "of", "pack", "pk",
  "product", "soft", "the", "x", "coles", "woolworths",
]);

const produceAliases: Record<string, string[]> = {
  "sweet potato": ["sweet potato", "sweet potatoes", "sweet potato gold", "gold sweet potato", "kumara"],
  broccoli: ["broccoli"],
  mushroom: ["mushroom", "mushrooms", "button mushroom", "button mushrooms"],
  garlic: ["garlic"],
  ginger: ["ginger"],
  carrot: ["carrot", "carrots"],
  cauliflower: ["cauliflower", "cauliflowers"],
  potato: ["potato", "potatoes"],
  tomato: ["tomato", "tomatoes"],
  onion: ["onion", "onions"],
  capsicum: ["capsicum", "capsicums", "bell pepper", "bell peppers"],
  cucumber: ["cucumber", "cucumbers"],
  zucchini: ["zucchini", "zucchinis", "courgette", "courgettes"],
  spinach: ["spinach"],
  lettuce: ["lettuce", "lettuces"],
  lemon: ["lemon", "lemons"],
  lime: ["lime", "limes"],
  apple: ["apple", "apples"],
  banana: ["banana", "bananas"],
  avocado: ["avocado", "avocados"],
};

const wikipediaQueries: Record<string, string> = {
  "sweet potato": "Sweet potato",
  broccoli: "Broccoli",
  mushroom: "Agaricus bisporus",
  garlic: "Garlic",
  ginger: "Ginger",
  carrot: "Carrot",
  cauliflower: "Cauliflower",
  potato: "Potato",
  tomato: "Tomato",
  onion: "Onion",
  capsicum: "Bell pepper",
  cucumber: "Cucumber",
  zucchini: "Zucchini",
  spinach: "Spinach",
  lettuce: "Lettuce",
  lemon: "Lemon",
  lime: "Lime (fruit)",
  apple: "Apple",
  banana: "Banana",
  avocado: "Avocado",
};

function safeImageUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normaliseWords(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|grams?|kilograms?|each|pack|pk)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word)
    .filter((word) => !ignoredProduceWords.has(word));
}

function normalisePackagedWords(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\b/g, " ")
    .replace(/\b\d+\s*(?:pack|pk|cans?|bottles?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word)
    .filter((word) => !ignoredPackagedWords.has(word));
}

function canonicalProduceIdentity(values: string[]) {
  const combined = values.join(" ").toLocaleLowerCase("en-AU");
  return Object.entries(produceAliases).find(([, aliases]) => (
    aliases.some((alias) => combined.includes(alias))
  ))?.[0] ?? null;
}

function produceSearchQueries(name: string, canonicalName: string | null, aliases: string[]) {
  const identity = canonicalProduceIdentity([canonicalName ?? "", name, ...aliases]);
  const knownAliases = identity ? produceAliases[identity] ?? [] : [];
  return {
    identity,
    queries: unique([canonicalName ?? "", name, ...aliases, ...knownAliases]).slice(0, 8),
  };
}

export function produceMatchScore(productTerms: string[], candidateName: string, source: string) {
  const candidateTerms = new Set(normaliseWords(candidateName));
  if (!productTerms.length || !candidateTerms.size) return 0;

  const matched = productTerms.filter((term) => candidateTerms.has(term)).length;
  const coverage = matched / productTerms.length;
  const precision = matched / candidateTerms.size;
  if (coverage < 0.75) return 0;

  const sourceBonus = source === "woolworths" || source === "coles" ? 12 : 5;
  return Math.round(60 * coverage + 25 * precision + sourceBonus);
}

function parsePackIdentity(value: string) {
  const lower = value.toLocaleLowerCase("en-AU");
  const unitMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\b/);
  const countMatch = lower.match(/(?:\bx\s*|\b)(\d{1,3})\s*(?:pack|pk|cans?|bottles?)\b|\b(\d{1,3})\s*x\s*\d/);
  const unitValue = unitMatch ? Number(unitMatch[1]) : null;
  const unit = unitMatch?.[2] ?? null;
  const normalisedUnitValue = unitValue === null ? null : unit === "l" || unit === "kg" ? unitValue * 1000 : unitValue;
  return {
    count: countMatch ? Number(countMatch[1] ?? countMatch[2]) : null,
    unit: unit === "l" ? "ml" : unit === "kg" ? "g" : unit,
    unitValue: normalisedUnitValue,
  };
}

export function packagedMatchScore(productIdentity: string, candidateName: string, source: string) {
  const productTerms = normalisePackagedWords(productIdentity);
  const candidateTerms = new Set(normalisePackagedWords(candidateName));
  if (!productTerms.length || !candidateTerms.size) return 0;

  const matched = productTerms.filter((term) => candidateTerms.has(term)).length;
  const coverage = matched / productTerms.length;
  if (coverage < 0.72) return 0;

  const productPack = parsePackIdentity(productIdentity);
  const candidatePack = parsePackIdentity(candidateName);
  if (productPack.count !== null && candidatePack.count !== null && productPack.count !== candidatePack.count) return 0;
  if (productPack.unitValue !== null && candidatePack.unitValue !== null) {
    if (productPack.unit !== candidatePack.unit || Math.abs(productPack.unitValue - candidatePack.unitValue) > 0.5) return 0;
  }

  let score = Math.round(68 * coverage);
  if (productPack.count !== null && candidatePack.count === productPack.count) score += 14;
  if (
    productPack.unitValue !== null
    && candidatePack.unitValue === productPack.unitValue
    && candidatePack.unit === productPack.unit
  ) score += 12;
  if (source === "woolworths" || source === "coles") score += 8;
  return Math.min(score, 99);
}

async function openFoodFactsCandidate(barcode: string): Promise<ImageCandidate | null> {
  const fields = "status,code,product_name,brands,image_front_url,image_url";
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
    { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" } },
  ).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json() as {
    status?: number;
    code?: string;
    product?: { product_name?: string; brands?: string; image_front_url?: string; image_url?: string };
  };
  if (payload.status === 0 || payload.code !== barcode || !payload.product) return null;
  const url = safeImageUrl(payload.product.image_front_url ?? payload.product.image_url);
  if (!url) return null;
  return {
    url,
    source: "open-food-facts",
    sourceLabel: [payload.product.brands, payload.product.product_name].filter(Boolean).join(" · ") || "Exact barcode match",
    score: 100,
  };
}

async function barcodeRetailerCandidates(barcode: string): Promise<ImageCandidate[]> {
  const results = await searchColesAndWoolworths(barcode).catch(() => []);
  return results.flatMap((candidate) => {
    const candidateBarcode = candidate.barcode?.replace(/\D/g, "") ?? "";
    const url = safeImageUrl(candidate.imageUrl);
    if (!url || candidateBarcode !== barcode) return [];
    return [{
      url,
      source: candidate.retailer.toLocaleLowerCase("en-AU"),
      sourceLabel: `${candidate.retailer} · ${candidate.productName}`,
      score: 110,
    }];
  });
}

async function packagedRetailerCandidates(queries: string[], identity: string): Promise<ImageCandidate[]> {
  const resultGroups = await Promise.all(queries.map((query) => searchColesAndWoolworths(query).catch(() => [])));
  const candidates = resultGroups.flat().flatMap((candidate) => {
    const url = safeImageUrl(candidate.imageUrl);
    if (!url) return [];
    const source = candidate.retailer.toLocaleLowerCase("en-AU");
    const score = packagedMatchScore(identity, candidate.productName, source);
    if (score < 82) return [];
    return [{
      url,
      source,
      sourceLabel: `${candidate.retailer} · ${candidate.productName}`,
      score,
    }];
  });

  const byUrl = new Map<string, ImageCandidate>();
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.url);
    if (!existing || candidate.score > existing.score) byUrl.set(candidate.url, candidate);
  }
  return [...byUrl.values()];
}

async function produceRetailerCandidates(queries: string[], identity: string | null): Promise<ImageCandidate[]> {
  const productTerms = normaliseWords(identity ?? queries[0] ?? "");
  const resultGroups = await Promise.all(queries.map((query) => searchColesAndWoolworths(query).catch(() => [])));
  const candidates = resultGroups.flat().flatMap((candidate) => {
    const url = safeImageUrl(candidate.imageUrl);
    if (!url) return [];
    const source = candidate.retailer.toLocaleLowerCase("en-AU");
    const score = produceMatchScore(productTerms, candidate.productName, source);
    if (score < 65) return [];
    return [{
      url,
      source,
      sourceLabel: `${candidate.retailer} · ${candidate.productName}`,
      score,
    }];
  });

  const byUrl = new Map<string, ImageCandidate>();
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.url);
    if (!existing || candidate.score > existing.score) byUrl.set(candidate.url, candidate);
  }
  return [...byUrl.values()];
}

async function wikipediaProduceCandidate(query: string): Promise<ImageCandidate | null> {
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, "_"))}`,
    {
      cache: "no-store",
      headers: { Accept: "application/json", "Api-User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" },
    },
  ).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json() as {
    type?: string;
    title?: string;
    originalimage?: { source?: string };
    thumbnail?: { source?: string };
  };
  if (payload.type === "disambiguation") return null;
  const url = safeImageUrl(payload.originalimage?.source ?? payload.thumbnail?.source);
  if (!url) return null;
  return {
    url,
    source: "wikipedia",
    sourceLabel: payload.title ?? query,
    score: 72,
  };
}

async function storedCandidates(productId: string) {
  return prisma.$queryRaw<StoredCandidate[]>`
    SELECT "url", "score", "rejected"
    FROM "ProductImageCandidate"
    WHERE "productId" = ${productId}
  `;
}

async function saveCandidate(productId: string, candidate: ImageCandidate) {
  await prisma.$executeRaw`
    INSERT INTO "ProductImageCandidate"
      ("id", "productId", "url", "source", "sourceLabel", "score", "selected", "rejected", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${productId}, ${candidate.url}, ${candidate.source}, ${candidate.sourceLabel}, ${candidate.score}, false, false, NOW(), NOW())
    ON CONFLICT ("productId", "url") DO UPDATE SET
      "source" = EXCLUDED."source",
      "sourceLabel" = EXCLUDED."sourceLabel",
      "score" = GREATEST("ProductImageCandidate"."score", EXCLUDED."score"),
      "updatedAt" = NOW()
  `;
}

export async function rejectCurrentProductImage(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { imageUrl: true } });
  const url = safeImageUrl(product?.imageUrl);
  if (!url) return;
  await prisma.$executeRaw`
    INSERT INTO "ProductImageCandidate"
      ("id", "productId", "url", "source", "sourceLabel", "score", "selected", "rejected", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${productId}, ${url}, 'manual-rejection', 'Rejected by user', 0, false, true, NOW(), NOW())
    ON CONFLICT ("productId", "url") DO UPDATE SET
      "selected" = false,
      "rejected" = true,
      "sourceLabel" = 'Rejected by user',
      "updatedAt" = NOW()
  `;
}

export async function findBestProductImage(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
      packSize: true,
      productType: true,
      barcode: true,
      imageUrl: true,
      aliases: { select: { alias: true } },
    },
  });
  if (!product) throw new Error("Product not found.");

  const barcode = product.barcode?.replace(/\D/g, "") ?? "";
  let discovered: ImageCandidate[] = [];

  if (gtinPattern.test(barcode)) {
    const identityParts = unique([
      product.brand ?? "",
      product.name,
      product.canonicalName ?? "",
      product.packSize ?? "",
    ]);
    const packagedIdentity = identityParts.join(" ");
    const packagedQueries = unique([
      product.name,
      [product.brand, product.name].filter(Boolean).join(" "),
      [product.name, product.packSize].filter(Boolean).join(" "),
      [product.brand, product.canonicalName, product.packSize].filter(Boolean).join(" "),
      ...product.aliases.map((alias) => alias.alias),
    ]).slice(0, 8);

    discovered = [
      ...(await barcodeRetailerCandidates(barcode)),
      ...(await packagedRetailerCandidates(packagedQueries, packagedIdentity)),
      await openFoodFactsCandidate(barcode),
    ].filter((candidate): candidate is ImageCandidate => candidate !== null);
  } else if (product.productType === "GENERIC_PRODUCE") {
    const search = produceSearchQueries(
      product.name,
      product.canonicalName,
      product.aliases.map((alias) => alias.alias),
    );
    const retailerMatches = await produceRetailerCandidates(search.queries, search.identity);
    const wikipediaQuery = search.identity ? wikipediaQueries[search.identity] : null;
    const fallback = wikipediaQuery ? await wikipediaProduceCandidate(wikipediaQuery) : null;
    discovered = [...retailerMatches, ...(fallback ? [fallback] : [])];
  } else {
    return { imageUrl: product.imageUrl, status: "barcode-required" as const };
  }

  for (const candidate of discovered) await saveCandidate(product.id, candidate);

  const stored = await storedCandidates(product.id);
  const rejectedUrls = new Set(stored.filter((candidate) => candidate.rejected).map((candidate) => candidate.url));
  const best = discovered
    .filter((candidate) => !rejectedUrls.has(candidate.url))
    .sort((left, right) => (
      imageCandidateSourcePriority(right.source) - imageCandidateSourcePriority(left.source)
      || right.score - left.score
    ))[0] ?? null;

  if (!best) {
    await prisma.product.update({ where: { id: product.id }, data: { imageUrl: null, lifecycle: "REVIEW_REQUIRED" } });
    return { imageUrl: null, status: gtinPattern.test(barcode) ? "no-exact-match" as const : "no-produce-match" as const };
  }

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "ProductImageCandidate"
      SET "selected" = ("url" = ${best.url}), "updatedAt" = NOW()
      WHERE "productId" = ${product.id}
    `,
    prisma.product.update({ where: { id: product.id }, data: { imageUrl: best.url, lifecycle: "READY" } }),
  ]);

  return { imageUrl: best.url, status: "selected" as const };
}
