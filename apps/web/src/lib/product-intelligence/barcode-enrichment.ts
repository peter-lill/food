import { EnrichmentJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchColesAndWoolworths, type RetailerPriceCandidate } from "@/lib/prices/coles-woolworths-provider";

const provider = "barcode-knowledge-v1";
const refreshWindowMs = 7 * 24 * 60 * 60 * 1000;
const requestTimeoutMs = 6_000;

type OpenFoodFactsProduct = {
  product_name?: unknown;
  brands?: unknown;
  quantity?: unknown;
  categories?: unknown;
  image_front_url?: unknown;
  image_url?: unknown;
  allergens_tags?: unknown;
  nutriments?: Record<string, unknown>;
};

type OpenFoodFactsResponse = { status?: number; product?: OpenFoodFactsProduct };

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validGtin(value: unknown) {
  const digits = clean(value).replace(/\D/g, "");
  if (!/^\d{8,14}$/.test(digits)) return null;
  const body = digits.slice(0, -1).split("").reverse().map(Number);
  const expected = (10 - (body.reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0) % 10)) % 10;
  return expected === Number(digits.at(-1)) ? digits : null;
}

function similarity(expected: string, candidate: string) {
  const expectedTokens = normalise(expected).split(" ").filter((token) => token.length > 1);
  const candidateTokens = new Set(normalise(candidate).split(" "));
  if (!expectedTokens.length) return 0;
  return expectedTokens.filter((token) => candidateTokens.has(token)).length / expectedTokens.length;
}

function bestRetailerCandidate(
  product: { name: string; canonicalName: string | null; brand: string | null; packSize: string | null },
  candidates: RetailerPriceCandidate[],
) {
  const expectedName = product.canonicalName ?? product.name;
  return candidates
    .map((candidate) => {
      const barcode = validGtin(candidate.barcode);
      if (!barcode) return null;
      const nameScore = similarity(expectedName, candidate.productName);
      const brandScore = product.brand ? Number(normalise(candidate.productName).includes(normalise(product.brand))) : 1;
      const packScore = product.packSize && candidate.packSize ? Number(normalise(product.packSize) === normalise(candidate.packSize)) : 1;
      return { candidate, barcode, score: nameScore * 0.75 + brandScore * 0.15 + packScore * 0.1 };
    })
    .filter((entry): entry is { candidate: RetailerPriceCandidate; barcode: string; score: number } => entry !== null)
    .filter((entry) => entry.score >= 0.82)
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

async function fetchOpenFoodFacts(barcode: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const fields = ["status", "product_name", "brands", "quantity", "categories", "image_front_url", "image_url", "allergens_tags", "nutriments"].join(",");
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" },
    });
    if (!response.ok) return null;
    const payload = await response.json() as OpenFoodFactsResponse;
    return payload.status === 0 ? null : payload.product ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function saveRetailerListing(productId: string, match: ReturnType<typeof bestRetailerCandidate>) {
  if (!match) return;
  const candidate = match.candidate;
  const externalId = candidate.externalId;
  if (!externalId) return;

  await prisma.storeProduct.upsert({
    where: { retailer_externalId: { retailer: candidate.retailer, externalId } },
    create: {
      productId,
      retailer: candidate.retailer,
      externalId,
      retailerProductName: candidate.productName,
      packSize: candidate.packSize,
      productUrl: candidate.sourceUrl,
      imageUrl: candidate.imageUrl,
      lastSeenAt: new Date(),
    },
    update: {
      productId,
      retailerProductName: candidate.productName,
      packSize: candidate.packSize,
      productUrl: candidate.sourceUrl,
      imageUrl: candidate.imageUrl,
      lastSeenAt: new Date(),
      active: true,
    },
  });
}

export async function enrichProductKnowledge(productId: string) {
  const recent = await prisma.productEnrichmentJob.findFirst({
    where: {
      productId,
      provider,
      status: EnrichmentJobStatus.COMPLETED,
      completedAt: { gte: new Date(Date.now() - refreshWindowMs) },
    },
    select: { id: true },
  });
  if (recent) return { status: "fresh" as const };

  const job = await prisma.productEnrichmentJob.create({
    data: { productId, provider, status: EnrichmentJobStatus.RUNNING, startedAt: new Date() },
    select: { id: true },
  }).catch(() => null);
  if (!job) return { status: "busy" as const };

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true, name: true, canonicalName: true, brand: true, barcode: true, category: true, packSize: true, imageUrl: true,
        calories: true, proteinGrams: true, carbsGrams: true, fatGrams: true, saturatedFatGrams: true,
        fibreGrams: true, sugarGrams: true, sodiumMg: true, allergens: true,
      },
    });
    if (!product) throw new Error("Product not found");

    let barcode = validGtin(product.barcode);
    if (!barcode) {
      const query = [product.brand, product.canonicalName ?? product.name, product.packSize].filter(Boolean).join(" ");
      const match = bestRetailerCandidate(product, await searchColesAndWoolworths(query));
      if (match) {
        const conflict = await prisma.product.findFirst({ where: { barcode: match.barcode, id: { not: product.id } }, select: { id: true } });
        if (!conflict) {
          barcode = match.barcode;
          await prisma.product.update({
            where: { id: product.id },
            data: { barcode, imageUrl: product.imageUrl ?? match.candidate.imageUrl, packSize: product.packSize ?? match.candidate.packSize },
          });
          await saveRetailerListing(product.id, match);
        }
      }
    }

    if (barcode) {
      const source = await fetchOpenFoodFacts(barcode);
      if (source) {
        const nutrients = source.nutriments ?? {};
        const allergens = Array.isArray(source.allergens_tags)
          ? source.allergens_tags.map(clean).filter(Boolean).map((value) => value.replace(/^[a-z]{2}:/i, ""))
          : [];
        const sodiumGrams = numeric(nutrients.sodium_100g);
        const sourceBrand = clean(source.brands) || null;
        const sourcePackSize = clean(source.quantity) || null;
        const sourceCategory = clean(source.categories).split(",")[0]?.trim() || null;
        const sourceImage = clean(source.image_front_url) || clean(source.image_url) || null;
        await prisma.product.update({
          where: { id: product.id },
          data: {
            brand: product.brand ?? sourceBrand,
            packSize: product.packSize ?? sourcePackSize,
            category: product.category ?? sourceCategory,
            imageUrl: product.imageUrl ?? sourceImage,
            calories: product.calories ?? numeric(nutrients["energy-kcal_100g"]),
            proteinGrams: product.proteinGrams ?? numeric(nutrients.proteins_100g),
            carbsGrams: product.carbsGrams ?? numeric(nutrients.carbohydrates_100g),
            fatGrams: product.fatGrams ?? numeric(nutrients.fat_100g),
            saturatedFatGrams: product.saturatedFatGrams ?? numeric(nutrients["saturated-fat_100g"]),
            fibreGrams: product.fibreGrams ?? numeric(nutrients.fiber_100g),
            sugarGrams: product.sugarGrams ?? numeric(nutrients.sugars_100g),
            sodiumMg: product.sodiumMg ?? (sodiumGrams === null ? null : sodiumGrams * 1000),
            allergens: product.allergens.length ? product.allergens : allergens,
          },
        });
      }
    }

    await prisma.productEnrichmentJob.update({
      where: { id: job.id },
      data: { status: EnrichmentJobStatus.COMPLETED, completedAt: new Date(), lastError: null },
    });
    return { status: "completed" as const, barcode };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.productEnrichmentJob.update({
      where: { id: job.id },
      data: { status: EnrichmentJobStatus.FAILED, completedAt: new Date(), attempts: { increment: 1 }, lastError: message.slice(0, 500) },
    }).catch(() => undefined);
    console.warn("Product knowledge enrichment failed", { productId, error: message });
    return { status: "failed" as const };
  }
}
