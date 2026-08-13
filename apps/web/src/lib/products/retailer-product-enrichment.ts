import { prisma } from "@/lib/prisma";
import { searchColesAndWoolworths, type RetailerPriceCandidate } from "@/lib/prices/coles-woolworths-provider";
import { informativeRetailerIdentity } from "@/lib/retailers/retailer-intelligence.service";

type ProductIdentity = {
  id: string;
  name: string;
  canonicalName: string | null;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  packSize: string | null;
};

function normalise(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalise(value).split(" ").filter((token) => token.length > 1);
}

function candidateScore(product: ProductIdentity, candidate: RetailerPriceCandidate) {
  const requested = informativeRetailerIdentity(product);
  const expected = tokens(requested);
  const candidateValue = normalise(candidate.productName);
  const candidateTokens = new Set(tokens(candidate.productName));
  if (!expected.length) return -Infinity;

  const coverage = expected.filter((token) => candidateTokens.has(token)).length / expected.length;
  if (coverage < 0.65) return -Infinity;

  let score = coverage * 100;
  if (candidateValue.includes(normalise(requested))) score += 50;
  if (candidate.imageUrl) score += 25;
  if (candidate.barcode) score += 15;
  if (candidate.packSize) score += 10;
  if (candidate.retailer === "Woolworths" || candidate.retailer === "Coles") score += 5;
  return score;
}

async function availableBarcode(productId: string, barcode: string | null) {
  if (!barcode || !/^\d{7,14}$/.test(barcode)) return null;
  const existing = await prisma.product.findUnique({ where: { barcode }, select: { id: true } });
  return !existing || existing.id === productId ? barcode : null;
}

export async function enrichProductFromRetailers(product: ProductIdentity) {
  const query = informativeRetailerIdentity(product);
  const candidates = await searchColesAndWoolworths(query);
  const candidate = candidates
    .map((item) => ({ item, score: candidateScore(product, item) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score)[0]?.item ?? null;

  if (!candidate) return null;

  const barcode = product.barcode ?? await availableBarcode(product.id, candidate.barcode);
  const imageUrl = product.imageUrl ?? candidate.imageUrl;
  const packSize = product.packSize ?? candidate.packSize;

  await prisma.product.update({
    where: { id: product.id },
    data: {
      barcode,
      imageUrl,
      packSize,
      canonicalName: product.canonicalName ?? query,
    },
  });

  let storeProduct = await prisma.storeProduct.findFirst({
    where: candidate.externalId
      ? { retailer: candidate.retailer, externalId: candidate.externalId }
      : { productId: product.id, retailer: candidate.retailer, retailerProductName: candidate.productName },
    select: { id: true },
  });

  if (storeProduct) {
    storeProduct = await prisma.storeProduct.update({
      where: { id: storeProduct.id },
      data: {
        productId: product.id,
        retailerProductName: candidate.productName,
        externalId: candidate.externalId,
        packSize: candidate.packSize,
        imageUrl: candidate.imageUrl,
        productUrl: candidate.sourceUrl,
        lastSeenAt: new Date(),
        active: true,
      },
      select: { id: true },
    });
  } else {
    storeProduct = await prisma.storeProduct.create({
      data: {
        productId: product.id,
        retailer: candidate.retailer,
        externalId: candidate.externalId,
        retailerProductName: candidate.productName,
        packSize: candidate.packSize,
        imageUrl: candidate.imageUrl,
        productUrl: candidate.sourceUrl,
        lastSeenAt: new Date(),
      },
      select: { id: true },
    });
  }

  await prisma.priceObservation.create({
    data: {
      productId: product.id,
      storeProductId: storeProduct.id,
      retailer: candidate.retailer,
      price: candidate.price,
      isSpecial: candidate.isSpecial,
      source: "retailer-api",
      sourceUrl: candidate.sourceUrl,
    },
  }).catch(() => undefined);

  return {
    imageUrl,
    barcode,
    packSize,
    retailer: candidate.retailer,
    retailerProductName: candidate.productName,
  };
}
