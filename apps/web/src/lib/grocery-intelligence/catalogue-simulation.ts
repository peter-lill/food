import { ProductLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GROCERY_IDENTITY_ENGINE_VERSION, identifyGrocery, type GroceryIdentity } from "./identity";

export type RepairProposal = {
  key: string;
  action: "RENAME" | "MERGE" | "REVIEW";
  productId: string;
  productName: string;
  targetProductId: string | null;
  targetProductName: string | null;
  suggestedName: string;
  confidence: number;
  evidence: string[];
  preparation: string[];
  size: string | null;
  impact: {
    inventory: number;
    ingredients: number;
    shopping: number;
    receipts: number;
    retailerListings: number;
    prices: number;
  };
};

export type CatalogueSimulation = {
  engineVersion: string;
  generatedAt: string;
  scanned: number;
  automatic: number;
  review: number;
  renames: number;
  merges: number;
  proposals: RepairProposal[];
};

type CatalogueProduct = Awaited<ReturnType<typeof loadProducts>>[number];
type IdentityCandidate = { product: CatalogueProduct; identity: GroceryIdentity | null };

function normalise(value: string | null | undefined) {
  return value?.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function impact(product: CatalogueProduct): RepairProposal["impact"] {
  return {
    inventory: product._count.inventoryItems,
    ingredients: product._count.ingredientRecords,
    shopping: product._count.shoppingItems,
    receipts: product._count.receiptItems,
    retailerListings: product._count.storeProducts,
    prices: product._count.priceObservations,
  };
}

function contaminationScore(candidate: IdentityCandidate) {
  if (!candidate.identity) return 1000;
  const productIdentity = normalise(candidate.product.name);
  const exactCleanName = productIdentity === candidate.identity.normalised ? 0 : 100;
  const preparationPenalty = candidate.identity.preparation.length * 30;
  const sizePenalty = candidate.identity.size ? 20 : 0;
  const technicalPenalty = candidate.identity.evidence.includes("technical noise removed") ? 100 : 0;
  return exactCleanName + preparationPenalty + sizePenalty + technicalPenalty;
}

function survivorScore(candidate: IdentityCandidate) {
  const product = candidate.product;
  return contaminationScore(candidate)
    - Number(Boolean(product.barcode)) * 15
    - product._count.storeProducts * 5
    - product._count.inventoryItems * 2
    - product._count.ingredientRecords;
}

async function loadProducts() {
  return prisma.product.findMany({
    where: { lifecycle: { not: ProductLifecycle.ARCHIVED } },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      barcode: true,
      updatedAt: true,
      createdAt: true,
      _count: {
        select: {
          inventoryItems: true,
          ingredientRecords: true,
          shoppingItems: true,
          receiptItems: true,
          storeProducts: true,
          priceObservations: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 5000,
  });
}

export async function simulateCatalogueRepair(): Promise<CatalogueSimulation> {
  const products = await loadProducts();
  const candidates: IdentityCandidate[] = products.map((product) => ({
    product,
    identity: identifyGrocery(product.canonicalName ?? product.name),
  }));

  const unresolved = candidates.filter((candidate) => !candidate.identity);
  const byIdentity = new Map<string, IdentityCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.identity) continue;
    const group = byIdentity.get(candidate.identity.normalised) ?? [];
    group.push(candidate);
    byIdentity.set(candidate.identity.normalised, group);
  }

  const proposals: RepairProposal[] = unresolved.map(({ product }) => ({
    key: `review:${product.id}`,
    action: "REVIEW",
    productId: product.id,
    productName: product.name,
    targetProductId: null,
    targetProductName: null,
    suggestedName: product.canonicalName ?? product.name,
    confidence: 0.3,
    evidence: ["No reliable grocery identity could be resolved"],
    preparation: [],
    size: null,
    impact: impact(product),
  }));

  for (const group of byIdentity.values()) {
    const sorted = [...group].sort((left, right) => survivorScore(left) - survivorScore(right) || left.product.createdAt.getTime() - right.product.createdAt.getTime());
    const survivor = sorted[0];
    const identity = survivor.identity!;
    const survivorIsClean = normalise(survivor.product.name) === identity.normalised
      && survivor.identity!.preparation.length === 0
      && !survivor.identity!.size;

    if (!survivorIsClean || normalise(survivor.product.canonicalName) !== identity.normalised) {
      proposals.push({
        key: `rename:${survivor.product.id}:${identity.normalised}`,
        action: "RENAME",
        productId: survivor.product.id,
        productName: survivor.product.name,
        targetProductId: null,
        targetProductName: null,
        suggestedName: identity.canonicalName,
        confidence: identity.confidence,
        evidence: [...identity.evidence, "Selected as clean canonical survivor"],
        preparation: identity.preparation,
        size: identity.size,
        impact: impact(survivor.product),
      });
    }

    for (const duplicate of sorted.slice(1)) {
      const duplicateIdentity = duplicate.identity!;
      proposals.push({
        key: `merge:${duplicate.product.id}:${survivor.product.id}:${identity.normalised}`,
        action: "MERGE",
        productId: duplicate.product.id,
        productName: duplicate.product.name,
        targetProductId: survivor.product.id,
        targetProductName: identity.canonicalName,
        suggestedName: identity.canonicalName,
        confidence: Math.min(0.99, Math.max(identity.confidence, duplicateIdentity.confidence) + 0.02),
        evidence: [...new Set([...duplicateIdentity.evidence, "Shared canonical grocery identity", "Clean survivor selected for group"])],
        preparation: duplicateIdentity.preparation,
        size: duplicateIdentity.size,
        impact: impact(duplicate.product),
      });
    }
  }

  const unique = [...new Map(proposals.map((proposal) => [proposal.key, proposal])).values()]
    .sort((left, right) => right.confidence - left.confidence || left.productName.localeCompare(right.productName, "en-AU"));

  return {
    engineVersion: GROCERY_IDENTITY_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    scanned: products.length,
    automatic: unique.filter((proposal) => proposal.action !== "REVIEW" && proposal.confidence >= 0.95).length,
    review: unique.filter((proposal) => proposal.action === "REVIEW" || proposal.confidence < 0.95).length,
    renames: unique.filter((proposal) => proposal.action === "RENAME").length,
    merges: unique.filter((proposal) => proposal.action === "MERGE").length,
    proposals: unique,
  };
}
