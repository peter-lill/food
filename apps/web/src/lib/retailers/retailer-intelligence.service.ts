import { prisma } from "@/lib/prisma";
import {
  searchColesAndWoolworthsCatalogue,
  type RetailerCatalogueCandidate,
} from "@/lib/prices/coles-woolworths-provider";
import { retailerListingIdentity } from "@/lib/retailers/retailer-listing-identity";

const refreshWindowMs = 6 * 60 * 60 * 1000;

type ProductIdentity = {
  id: string;
  name: string;
  canonicalName: string | null;
  brand: string | null;
  barcode: string | null;
  packSize: string | null;
  imageUrl: string | null;
};

function normalise(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-AU")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string | null | undefined) {
  return normalise(value).split(" ").filter((token) => token.length > 1);
}

function normaliseBarcode(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits || null;
}

function normalisePackSize(value: string | null | undefined) {
  const match = normalise(value).match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pack|pk|capsules?|tablets?|cans?|bottles?|rolls?)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLocaleLowerCase("en-AU");
  if (!Number.isFinite(amount)) return null;
  if (unit === "kg") return `${amount * 1000}g`;
  if (unit === "l") return `${amount * 1000}ml`;
  if (unit === "pk") return `${amount}pack`;
  return `${amount}${unit.replace(/s$/, "")}`;
}

function identityScore(product: ProductIdentity, candidate: RetailerCatalogueCandidate) {
  const productBarcode = normaliseBarcode(product.barcode);
  const candidateBarcode = normaliseBarcode(candidate.barcode);
  if (productBarcode && candidateBarcode && productBarcode === candidateBarcode) return 20_000;

  const productName = normalise([product.brand, product.name, product.canonicalName].filter(Boolean).join(" "));
  const candidateName = normalise(candidate.productName);
  const requestedTokens = tokens(productName);
  const candidateTokens = new Set(tokens(candidateName));
  const overlap = requestedTokens.length
    ? requestedTokens.filter((token) => candidateTokens.has(token)).length / requestedTokens.length
    : 0;

  let score = overlap * 1_000;
  if (candidateName === normalise(product.name)) score += 1_200;
  if (candidateName.includes(normalise(product.name))) score += 700;

  const brand = normalise(product.brand);
  if (brand) score += candidateName.includes(brand) ? 600 : -700;

  const productPack = normalisePackSize(product.packSize ?? product.name);
  const candidatePack = normalisePackSize(candidate.packSize ?? candidate.productName);
  if (productPack && candidatePack) score += productPack === candidatePack ? 900 : -1_200;

  if (candidate.retailer === "Coles") score += 120;
  if (candidate.externalId) score += 80;
  if (candidate.imageUrl) score += 40;
  return score;
}

function searchQuery(product: ProductIdentity) {
  return product.barcode?.trim()
    || [product.brand, product.name, product.packSize].filter(Boolean).join(" ")
    || product.name;
}

async function recentlyRefreshed(productId: string) {
  const cutoff = new Date(Date.now() - refreshWindowMs);
  const listing = await prisma.storeProduct.findFirst({
    where: { productId, lastSeenAt: { gte: cutoff } },
    select: { id: true },
  });
  return Boolean(listing);
}

async function persistCandidate(product: ProductIdentity, candidate: RetailerCatalogueCandidate) {
  const identity = retailerListingIdentity(candidate);
  const listingData = {
    productId: product.id,
    retailer: candidate.retailer,
    externalId: candidate.externalId,
    retailerProductName: candidate.productName,
    brand: product.brand,
    packSize: candidate.packSize,
    productUrl: candidate.sourceUrl,
    imageUrl: candidate.imageUrl,
    active: true,
    lastSeenAt: new Date(),
  };

  const listing = identity.kind === "external-id"
    ? await prisma.storeProduct.upsert({
      where: {
        retailer_externalId: {
          retailer: candidate.retailer,
          externalId: identity.externalId,
        },
      },
      create: listingData,
      update: listingData,
    })
    : await (async () => {
      const existing = await prisma.storeProduct.findFirst({
        where: {
          productId: product.id,
          retailer: identity.retailer,
          externalId: null,
          retailerProductName: identity.retailerProductName,
          packSize: identity.packSize,
        },
        orderBy: { createdAt: "asc" },
      });
      return existing
        ? prisma.storeProduct.update({ where: { id: existing.id }, data: listingData })
        : prisma.storeProduct.create({ data: listingData });
    })();

  if (candidate.price !== null && Number.isFinite(candidate.price) && candidate.price > 0) {
    const latest = await prisma.priceObservation.findFirst({
      where: { productId: product.id, storeProductId: listing.id },
      orderBy: { observedAt: "desc" },
      select: { price: true, isSpecial: true, observedAt: true },
    });
    const isFreshDuplicate = latest
      && Date.now() - latest.observedAt.getTime() < refreshWindowMs
      && latest.price === candidate.price
      && latest.isSpecial === candidate.isSpecial;

    if (!isFreshDuplicate) {
      await prisma.priceObservation.create({
        data: {
          productId: product.id,
          storeProductId: listing.id,
          retailer: candidate.retailer,
          price: candidate.price,
          isSpecial: candidate.isSpecial,
          source: "retailer-intelligence",
          sourceUrl: candidate.sourceUrl,
          observedAt: new Date(),
        },
      });
    }
  }

  return listing;
}

export async function enrichProductRetailers(productId: string, options?: { force?: boolean }) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
      barcode: true,
      packSize: true,
      imageUrl: true,
    },
  });
  if (!product) return { refreshed: false, matches: 0 };
  if (!options?.force && await recentlyRefreshed(product.id)) return { refreshed: false, matches: 0 };

  const candidates = await searchColesAndWoolworthsCatalogue(searchQuery(product));
  const accepted = (["Coles", "Woolworths"] as const).flatMap((retailer) => {
    const ranked = candidates
      .filter((candidate) => candidate.retailer === retailer)
      .map((candidate) => ({ candidate, score: identityScore(product, candidate) }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best) return [];
    const barcodeMatch = normaliseBarcode(product.barcode)
      && normaliseBarcode(product.barcode) === normaliseBarcode(best.candidate.barcode);
    return barcodeMatch || best.score >= 900 ? [best.candidate] : [];
  });

  for (const candidate of accepted) await persistCandidate(product, candidate);

  const preferredImage = accepted.find((candidate) => candidate.retailer === "Coles" && candidate.imageUrl)?.imageUrl
    ?? accepted.find((candidate) => candidate.imageUrl)?.imageUrl
    ?? null;
  if (!product.imageUrl && preferredImage) {
    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl: preferredImage, lifecycle: "MATCHED" },
    });
  }

  return { refreshed: true, matches: accepted.length };
}

