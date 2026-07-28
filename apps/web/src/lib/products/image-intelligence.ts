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

const gtinPattern = /^\d{7,14}$/;
const produceQueries: Array<{ pattern: RegExp; query: string }> = [
  { pattern: /\bsweet potatoes?\b|\bkumara\b/i, query: "Sweet potato" },
  { pattern: /\bbroccoli\b/i, query: "Broccoli" },
  { pattern: /\bbutton mushrooms?\b|\bmushrooms?\b/i, query: "Agaricus bisporus" },
  { pattern: /\bgarlic\b/i, query: "Garlic" },
  { pattern: /\bginger\b/i, query: "Ginger" },
  { pattern: /\bcarrots?\b/i, query: "Carrot" },
  { pattern: /\bcauliflowers?\b/i, query: "Cauliflower" },
  { pattern: /\bpotatoes?\b/i, query: "Potato" },
  { pattern: /\btomatoes?\b/i, query: "Tomato" },
  { pattern: /\bonions?\b/i, query: "Onion" },
  { pattern: /\bcapsicums?\b|\bbell peppers?\b/i, query: "Bell pepper" },
  { pattern: /\bcucumbers?\b/i, query: "Cucumber" },
  { pattern: /\bzucchinis?\b|\bcourgettes?\b/i, query: "Zucchini" },
  { pattern: /\bspinach\b/i, query: "Spinach" },
  { pattern: /\blettuces?\b/i, query: "Lettuce" },
  { pattern: /\blemons?\b/i, query: "Lemon" },
  { pattern: /\blimes?\b/i, query: "Lime (fruit)" },
  { pattern: /\bapples?\b/i, query: "Apple" },
  { pattern: /\bbananas?\b/i, query: "Banana" },
  { pattern: /\bavocados?\b/i, query: "Avocado" },
];

function safeImageUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
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
    score: 94,
  };
}

async function retailerCandidates(barcode: string): Promise<ImageCandidate[]> {
  const results = await searchColesAndWoolworths(barcode).catch(() => []);
  return results.flatMap((candidate) => {
    const candidateBarcode = candidate.barcode?.replace(/\D/g, "") ?? "";
    const url = safeImageUrl(candidate.imageUrl);
    if (!url || candidateBarcode !== barcode) return [];
    return [{
      url,
      source: candidate.retailer.toLocaleLowerCase("en-AU"),
      sourceLabel: `${candidate.retailer} · ${candidate.productName}`,
      score: 100,
    }];
  });
}

function produceQuery(name: string, canonicalName: string | null) {
  const identity = [canonicalName, name].filter(Boolean).join(" ");
  return produceQueries.find((entry) => entry.pattern.test(identity))?.query ?? null;
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
    score: 88,
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
    select: { id: true, name: true, canonicalName: true, productType: true, barcode: true, imageUrl: true },
  });
  if (!product) throw new Error("Product not found.");

  const barcode = product.barcode?.replace(/\D/g, "") ?? "";
  let discovered: ImageCandidate[] = [];

  if (gtinPattern.test(barcode)) {
    discovered = [
      await openFoodFactsCandidate(barcode),
      ...(await retailerCandidates(barcode)),
    ].filter((candidate): candidate is ImageCandidate => candidate !== null);
  } else if (product.productType === "GENERIC_PRODUCE") {
    const query = produceQuery(product.name, product.canonicalName);
    if (query) {
      const candidate = await wikipediaProduceCandidate(query);
      if (candidate) discovered = [candidate];
    }
  } else {
    return { imageUrl: product.imageUrl, status: "barcode-required" as const };
  }

  for (const candidate of discovered) await saveCandidate(product.id, candidate);

  const stored = await storedCandidates(product.id);
  const rejectedUrls = new Set(stored.filter((candidate) => candidate.rejected).map((candidate) => candidate.url));
  const best = discovered
    .filter((candidate) => !rejectedUrls.has(candidate.url))
    .sort((left, right) => right.score - left.score)[0] ?? null;

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
