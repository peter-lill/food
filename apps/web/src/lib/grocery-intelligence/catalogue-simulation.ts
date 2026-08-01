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

function survivorScore(product: {
  name: string;
  canonicalName: string | null;
  barcode: string | null;
  _count: { inventoryItems: number; ingredientRecords: number; shoppingItems: number; receiptItems: number; storeProducts: number; priceObservations: number };
}, canonicalName: string) {
  const exact = normalise(product.name) === normalise(canonicalName) ? 1000 : 0;
  return exact
    + Number(Boolean(product.barcode)) * 200
    + product._count.storeProducts * 30
    + product._count.priceObservations * 5
    + product._count.inventoryItems * 4
    + product._count.ingredientRecords * 3
    + product._count.shoppingItems * 2
    + product._count.receiptItems;
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

  const survivorByIdentity = new Map<string, (typeof products)[number]>();
  for (const [identity, group] of byIdentity) {
    const canonicalName = candidates.find((candidate) => candidate.identity?.normalised === identity)?.identity?.canonicalName ?? identity;
    const survivor = [...group].sort((left, right) => survivorScore(right, canonicalName) - survivorScore(left, canonicalName))[0];
    if (survivor) survivorByIdentity.set(identity, survivor);
  }

  const proposals: RepairProposal[] = [];
  for (const { product, identity } of candidates) {
    const impact = {
      inventory: product._count.inventoryItems,
      ingredients: product._count.ingredientRecords,
      shopping: product._count.shoppingItems,
      receipts: product._count.receiptItems,
      retailerListings: product._count.storeProducts,
      prices: product._count.priceObservations,
    };

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
        impact,
      });
      continue;
    }

    const group = byIdentity.get(identity.normalised) ?? [];
    const survivor = survivorByIdentity.get(identity.normalised) ?? null;
    if (group.length > 1 && survivor && survivor.id !== product.id) {
      proposals.push({
        key: `merge:${product.id}:${survivor.id}`,
        action: "MERGE",
        productId: product.id,
        productName: product.name,
        targetProductId: survivor.id,
        targetProductName: survivor.canonicalName ?? survivor.name,
        suggestedName: identity.canonicalName,
        confidence: Math.min(0.99, identity.confidence + 0.03),
        evidence: [...identity.evidence, "Single preferred survivor selected for identity group"],
        impact,
      });
      continue;
    }

    const currentIdentity = normalise(product.canonicalName ?? product.name);
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
        impact,
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
