import { ProductLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GROCERY_IDENTITY_ENGINE_VERSION, identifyGrocery } from "./identity";

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

function normalise(value: string | null | undefined) {
  return value?.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

export async function simulateCatalogueRepair(): Promise<CatalogueSimulation> {
  const products = await prisma.product.findMany({
    where: { lifecycle: { not: ProductLifecycle.ARCHIVED } },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      barcode: true,
      updatedAt: true,
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

  const candidates = products.map((product) => ({ product, identity: identifyGrocery(product.canonicalName ?? product.name) }));
  const byIdentity = new Map<string, typeof products>();
  for (const candidate of candidates) {
    if (!candidate.identity) continue;
    const group = byIdentity.get(candidate.identity.normalised) ?? [];
    group.push(candidate.product);
    byIdentity.set(candidate.identity.normalised, group);
  }

  const proposals: RepairProposal[] = [];
  for (const { product, identity } of candidates) {
    if (!identity) {
      proposals.push({
        key: `review:${product.id}`,
        action: "REVIEW",
        productId: product.id,
        productName: product.name,
        targetProductId: null,
        targetProductName: null,
        suggestedName: product.canonicalName ?? product.name,
        confidence: 0.3,
        evidence: ["No reliable grocery identity could be resolved"],
        impact: {
          inventory: product._count.inventoryItems,
          ingredients: product._count.ingredientRecords,
          shopping: product._count.shoppingItems,
          receipts: product._count.receiptItems,
          retailerListings: product._count.storeProducts,
          prices: product._count.priceObservations,
        },
      });
      continue;
    }

    const group = byIdentity.get(identity.normalised) ?? [];
    const target = group
      .filter((item) => item.id !== product.id)
      .sort((left, right) => {
        const leftScore = Number(Boolean(left.barcode)) * 100 + left._count.storeProducts * 10 + left._count.inventoryItems;
        const rightScore = Number(Boolean(right.barcode)) * 100 + right._count.storeProducts * 10 + right._count.inventoryItems;
        return rightScore - leftScore;
      })[0] ?? null;

    const currentIdentity = normalise(product.canonicalName ?? product.name);
    if (target && normalise(target.canonicalName ?? target.name) === identity.normalised) {
      proposals.push({
        key: `merge:${product.id}:${target.id}`,
        action: "MERGE",
        productId: product.id,
        productName: product.name,
        targetProductId: target.id,
        targetProductName: target.canonicalName ?? target.name,
        suggestedName: identity.canonicalName,
        confidence: Math.min(0.99, identity.confidence + 0.03),
        evidence: [...identity.evidence, "Existing canonical product found"],
        impact: {
          inventory: product._count.inventoryItems,
          ingredients: product._count.ingredientRecords,
          shopping: product._count.shoppingItems,
          receipts: product._count.receiptItems,
          retailerListings: product._count.storeProducts,
          prices: product._count.priceObservations,
        },
      });
      continue;
    }

    if (currentIdentity !== identity.normalised || product.name !== identity.canonicalName) {
      proposals.push({
        key: `rename:${product.id}`,
        action: "RENAME",
        productId: product.id,
        productName: product.name,
        targetProductId: null,
        targetProductName: null,
        suggestedName: identity.canonicalName,
        confidence: identity.confidence,
        evidence: identity.evidence,
        impact: {
          inventory: product._count.inventoryItems,
          ingredients: product._count.ingredientRecords,
          shopping: product._count.shoppingItems,
          receipts: product._count.receiptItems,
          retailerListings: product._count.storeProducts,
          prices: product._count.priceObservations,
        },
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
