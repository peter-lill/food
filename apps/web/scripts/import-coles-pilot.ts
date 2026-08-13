import "dotenv/config";

import { ProductLifecycle, ProductType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { searchColesAndWoolworthsCatalogue, type RetailerCatalogueCandidate } from "../src/lib/prices/coles-woolworths-provider";
import { normaliseProductText, slugifyProductName } from "../src/lib/products/product-normalisation";
import { explainPilotCandidate } from "./coles-pilot-matching";

const apply = process.argv.includes("--apply");

export const pilotSelections = [
  { query: "Coles Full Cream Milk 2L", category: "Dairy & eggs", type: ProductType.DAIRY },
  { query: "Coles Light Milk 2L", category: "Dairy & eggs", type: ProductType.DAIRY },
  { query: "Coles Lactose Free Full Cream Milk 1L", category: "Dairy & eggs", type: ProductType.DAIRY },
  { query: "Coles Greek Style Natural Yoghurt 1kg", category: "Dairy & eggs", type: ProductType.DAIRY },
  { query: "Coles Free Range Eggs 12 Pack", category: "Dairy & eggs", type: ProductType.DAIRY },
  { query: "Coles Tasty Cheddar Cheese Block 500g", category: "Dairy & eggs", type: ProductType.DAIRY },
  { query: "Coles White Sandwich Bread 700g", category: "Bakery", type: ProductType.BAKERY },
  { query: "Coles Wholemeal Sandwich Bread 700g", category: "Bakery", type: ProductType.BAKERY },
  { query: "Coles Rolled Oats 1kg", category: "Pantry", type: ProductType.PACKAGED },
  { query: "Coles Long Grain Rice 1kg", category: "Pantry", type: ProductType.PACKAGED },
  { query: "Coles Penne Pasta 500g", category: "Pantry", type: ProductType.PACKAGED },
  { query: "Coles Plain Flour 1kg", category: "Pantry", type: ProductType.PACKAGED },
  { query: "Coles White Sugar 1kg", category: "Pantry", type: ProductType.PACKAGED },
  { query: "Coles Diced Tomatoes 400g", category: "Pantry", type: ProductType.PACKAGED },
  { query: "Coles Chick Peas 400g", category: "Pantry", type: ProductType.PACKAGED },
  { query: "Coles Extra Virgin Olive Oil 1L", category: "Pantry", type: ProductType.PACKAGED },
  { query: "Coca Cola Classic 1.25L", category: "Drinks", type: ProductType.BEVERAGE },
  { query: "Pepsi Max 1.25L", category: "Drinks", type: ProductType.BEVERAGE },
  { query: "Dare Double Espresso Iced Coffee 750mL", category: "Drinks", type: ProductType.BEVERAGE },
  { query: "Cadbury Dairy Milk Chocolate Block 180g", category: "Snacks & confectionery", type: ProductType.PACKAGED },
  { query: "KitKat Milk Chocolate Block 170g", category: "Snacks & confectionery", type: ProductType.PACKAGED },
  { query: "Arnott's Tim Tam Original 200g", category: "Snacks & confectionery", type: ProductType.PACKAGED },
  { query: "Coles Potato Chips Original 175g", category: "Snacks & confectionery", type: ProductType.PACKAGED },
  { query: "Coles Ultra Concentrate Dishwashing Liquid 450mL", category: "Household", type: ProductType.HOUSEHOLD },
  { query: "Coles 3 Ply Toilet Tissue 8 Pack", category: "Household", type: ProductType.HOUSEHOLD },
  { query: "Kleenex Facial Tissues 2 Ply 200 Pack", category: "Household", type: ProductType.HOUSEHOLD },
  { query: "Coles Ibuprofen Tablets 24 Pack", category: "Health & personal care", type: ProductType.PERSONAL_CARE },
  { query: "Soothers Blackcurrant Lozenges 10 Pack", category: "Health & personal care", type: ProductType.PERSONAL_CARE },
  { query: "Coles Australian Carrots 1kg", category: "Fruit & vegetables", type: ProductType.GENERIC_PRODUCE },
  { query: "Coles Brown Onions 1kg", category: "Fruit & vegetables", type: ProductType.GENERIC_PRODUCE },
] as const;

type Selection = typeof pilotSelections[number];
type Accepted = { selection: Selection; candidate: RetailerCatalogueCandidate; score: number };

async function resolveSelection(selection: Selection): Promise<Accepted> {
  const candidates = await searchColesAndWoolworthsCatalogue(selection.query, { retailers: ["Coles"] });
  const assessed = candidates.map((candidate) => ({ selection, candidate, ...explainPilotCandidate(selection.query, candidate) }));
  const ranked = assessed
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score);
  const winner = ranked[0];
  if (!winner) {
    const diagnostics = assessed.length
      ? assessed.map(({ candidate, rejection }) => `- ${candidate.productName} | ${candidate.packSize ?? "no size"} | $${candidate.price ?? "no price"} | ${rejection ?? "rejected"}`).join("\n")
      : "- Coles returned no candidates";
    throw new Error(`No authoritative Coles match for: ${selection.query}\nCandidates inspected:\n${diagnostics}`);
  }
  if (ranked[1] && winner.score - ranked[1].score < 5 && ranked[1].candidate.externalId !== winner.candidate.externalId) {
    throw new Error(`Ambiguous Coles match for: ${selection.query}`);
  }
  return winner;
}

async function existingProductId(candidate: RetailerCatalogueCandidate) {
  const listing = await prisma.storeProduct.findUnique({
    where: { retailer_externalId: { retailer: "Coles", externalId: candidate.externalId! } },
    select: { productId: true },
  });
  if (listing) return listing.productId;
  if (candidate.barcode) {
    const product = await prisma.product.findUnique({ where: { barcode: candidate.barcode }, select: { id: true } });
    if (product) return product.id;
  }
  const alias = await prisma.productAlias.findUnique({
    where: { normalised: normaliseProductText(candidate.productName) },
    select: { productId: true },
  });
  if (alias) return alias.productId;
  return null;
}

async function importCandidate({ selection, candidate }: Accepted) {
  const retainedId = await existingProductId(candidate);
  if (retainedId) return { created: false, productId: retainedId };

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: candidate.productName,
        canonicalName: candidate.productName,
        slug: `${slugifyProductName(candidate.productName)}-${candidate.externalId}`,
        barcode: candidate.barcode,
        category: selection.category,
        imageUrl: candidate.imageUrl,
        packSize: candidate.packSize,
        productType: selection.type,
        lifecycle: ProductLifecycle.MATCHED,
        confidenceScore: 0.95,
      },
      select: { id: true },
    });
    await tx.productAlias.create({
      data: { productId: product.id, alias: candidate.productName, normalised: normaliseProductText(candidate.productName), source: "coles-pilot" },
    });
    const listing = await tx.storeProduct.create({
      data: {
        productId: product.id,
        retailer: "Coles",
        externalId: candidate.externalId,
        retailerProductName: candidate.productName,
        packSize: candidate.packSize,
        productUrl: candidate.sourceUrl,
        imageUrl: candidate.imageUrl,
        lastSeenAt: new Date(),
      },
      select: { id: true },
    });
    await tx.priceObservation.create({
      data: {
        productId: product.id,
        storeProductId: listing.id,
        retailer: "Coles",
        price: candidate.price!,
        isSpecial: candidate.isSpecial,
        source: "coles-pilot",
        sourceUrl: candidate.sourceUrl,
      },
    });
    return { created: true, productId: product.id };
  });
}

async function main() {
  if (pilotSelections.length !== 30) throw new Error(`Pilot must contain exactly 30 selections, found ${pilotSelections.length}.`);
  const accepted: Accepted[] = [];
  for (const selection of pilotSelections) {
    const match = await resolveSelection(selection);
    accepted.push(match);
    console.log(`${apply ? "Validated" : "Would import"}: ${match.candidate.productName} | $${match.candidate.price?.toFixed(2)} | ${match.candidate.externalId}`);
  }
  if (accepted.length !== 30) throw new Error("All 30 Coles selections must validate before the pilot can be applied.");
  if (!apply) return console.log("Preview complete. No database changes were made.");

  let created = 0;
  let retained = 0;
  for (const match of accepted) {
    const result = await importCandidate(match);
    result.created ? created += 1 : retained += 1;
  }
  console.log(`Coles pilot complete: ${created} created, ${retained} retained, 30 authoritative selections processed.`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
