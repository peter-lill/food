import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { classifyProduct, classifyProductText, productDepartment } from "../src/lib/products/product-category";

const apply = process.argv.includes("--apply");

type Proposal = { id: string; name: string; from: string | null; to: string; shelf: string | null; confidence: string; reason: string };
type RetailerConflict = { name: string; stored: string | null; identity: string; retailer: string; aisle: string | null };

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, canonicalName: true, category: true, storeProducts: { select: { retailer: true, retailerProductName: true, aisle: true } } },
    orderBy: { name: "asc" },
  });
  const changes: Proposal[] = [];
  const review: Proposal[] = [];
  const retailerConflicts: RetailerConflict[] = [];
  const unresolved: Array<{ name: string; category: string | null }> = [];
  const counts = new Map<string, number>();

  for (const product of products) {
    const name = product.canonicalName ?? product.name;
    const identity = classifyProductText(name);
    const storedEffective = productDepartment(product.category, name);

    // Retailer taxonomy is deliberately corroborative at this stage. Broad aisle
    // labels such as "Chilled Dog Food", "Frozen Seafood" and "Sandwich Freezer
    // Bags" contain words that resemble departments but do not redefine product
    // identity. A retailer-derived department may only become automatic after a
    // retailer-specific path map exists and has been regression-tested.
    for (const listing of product.storeProducts) {
      const retailerResult = classifyProduct({
        name: listing.retailerProductName || name,
        storedCategory: product.category,
        retailer: listing.retailer,
        aisle: listing.aisle,
      });
      if (retailerResult.confidence === "authoritative" && retailerResult.department !== "Other" && retailerResult.department !== identity.department) {
        retailerConflicts.push({ name, stored: product.category, identity: identity.department, retailer: retailerResult.department, aisle: listing.aisle });
      }
    }

    const effective = identity.confidence === "high" && identity.department !== "Other" ? identity.department : storedEffective;
    counts.set(effective, (counts.get(effective) ?? 0) + 1);

    const differs = identity.department !== "Other" && effective !== product.category;
    const proposal: Proposal = { id: product.id, name, from: product.category, to: effective, shelf: identity.shelf, confidence: identity.confidence, reason: identity.reason };

    // Automatic writes are now name-identity repairs only for genuinely
    // uncategorised/Other products. Existing canonical categories, including
    // legacy Pantry, are review-only. Retailer aisle inference never writes.
    if (differs && identity.confidence === "high" && (!product.category || product.category === "Other")) {
      changes.push(proposal);
    } else if (differs) {
      review.push(proposal);
    }

    if (effective === "Other") unresolved.push({ name, category: product.category });
  }

  console.log(`Catalogue taxonomy audit: ${products.length} products.`);
  console.log(`Effective department counts: ${JSON.stringify(Object.fromEntries([...counts].sort()))}`);
  console.log(`High-confidence corrections: ${changes.length}`);
  for (const change of changes) console.log(`${change.name}: ${change.from ?? "Uncategorised"} -> ${change.to}${change.shelf ? ` / ${change.shelf}` : ""} (${change.reason})`);

  console.log(`Review-only proposals: ${review.length}`);
  for (const item of review.slice(0, 200)) console.log(`[review] ${item.name}: ${item.from ?? "Uncategorised"} -> ${item.to}${item.shelf ? ` / ${item.shelf}` : ""} (${item.confidence}; ${item.reason})`);
  if (review.length > 200) console.log(`[review] ... ${review.length - 200} additional proposals omitted from console output.`);

  console.log(`Retailer taxonomy conflicts: ${retailerConflicts.length}`);
  for (const item of retailerConflicts.slice(0, 200)) console.log(`[retailer-conflict] ${item.name}: stored ${item.stored ?? "Uncategorised"}; identity ${item.identity}; retailer ${item.retailer}${item.aisle ? ` / ${item.aisle}` : ""}`);
  if (retailerConflicts.length > 200) console.log(`[retailer-conflict] ... ${retailerConflicts.length - 200} additional conflicts omitted from console output.`);

  console.log(`Unresolved Other: ${unresolved.length}`);
  for (const item of unresolved.slice(0, 200)) console.log(`[unresolved] ${item.name}${item.category ? ` (stored ${item.category})` : ""}`);
  if (unresolved.length > 200) console.log(`[unresolved] ... ${unresolved.length - 200} additional products omitted from console output.`);

  if (apply && changes.length) {
    await prisma.$transaction(changes.map((change) => prisma.product.update({ where: { id: change.id }, data: { category: change.to } })));
    console.log(`Applied ${changes.length} identity-backed category corrections.`);
  } else if (!apply) {
    console.log("Preview only. Do not use --apply until the regression suite passes and the identity-backed correction list has been reviewed.");
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
