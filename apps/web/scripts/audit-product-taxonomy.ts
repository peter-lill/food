import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { classifyProduct, classifyProductText, productDepartment } from "../src/lib/products/product-category";

const apply = process.argv.includes("--apply");
const full = process.argv.includes("--full");

type Proposal = { id: string; name: string; from: string | null; to: string; shelf: string | null; confidence: string; reason: string };
type RetailerConflict = { name: string; stored: string | null; identity: string; retailer: string; aisle: string | null };
type Unresolved = { name: string; category: string | null };

type ReasonSummary = {
  reason: string;
  count: number;
  examples: string[];
};

function summariseByReason(items: Proposal[]): ReasonSummary[] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const names = groups.get(item.reason) ?? [];
    names.push(item.name);
    groups.set(item.reason, names);
  }
  return [...groups.entries()]
    .map(([reason, names]) => ({ reason, count: names.length, examples: names.slice(0, 5) }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function summariseUnresolved(items: Unresolved[]) {
  const buckets = new Map<string, string[]>();
  for (const item of items) {
    const firstToken = item.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)[0] || "unknown";
    const names = buckets.get(firstToken) ?? [];
    names.push(item.name);
    buckets.set(firstToken, names);
  }
  return [...buckets.entries()]
    .map(([token, names]) => ({ token, count: names.length, examples: names.slice(0, 8) }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
}

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, canonicalName: true, category: true, storeProducts: { select: { retailer: true, retailerProductName: true, aisle: true } } },
    orderBy: { name: "asc" },
  });
  const changes: Proposal[] = [];
  const review: Proposal[] = [];
  const retailerConflicts: RetailerConflict[] = [];
  const unresolved: Unresolved[] = [];
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

    // Automatic writes remain identity repairs only for genuinely uncategorised
    // or Other products. Existing canonical categories remain review-only until
    // a whole-catalogue pass confirms the relevant product-family rule.
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
  console.log(`Review-only proposals: ${review.length}`);
  console.log(`Retailer taxonomy conflicts: ${retailerConflicts.length}`);
  console.log(`Unresolved Other: ${unresolved.length}`);

  console.log("\nHigh-confidence correction families:");
  for (const group of summariseByReason(changes)) console.log(`[family] ${group.count} - ${group.reason} :: ${group.examples.join(" | ")}`);

  console.log("\nReview-only proposal families:");
  for (const group of summariseByReason(review)) console.log(`[family] ${group.count} - ${group.reason} :: ${group.examples.join(" | ")}`);

  console.log("\nLargest unresolved name families:");
  for (const group of summariseUnresolved(unresolved).slice(0, 100)) console.log(`[unresolved-family] ${group.count} - ${group.token} :: ${group.examples.join(" | ")}`);

  const previewLimit = full ? Number.POSITIVE_INFINITY : 200;

  console.log("\nHigh-confidence corrections detail:");
  for (const change of changes.slice(0, previewLimit)) console.log(`${change.name}: ${change.from ?? "Uncategorised"} -> ${change.to}${change.shelf ? ` / ${change.shelf}` : ""} (${change.reason})`);
  if (!full && changes.length > previewLimit) console.log(`... ${changes.length - previewLimit} additional high-confidence corrections omitted; rerun with --full.`);

  console.log("\nReview-only proposals detail:");
  for (const item of review.slice(0, previewLimit)) console.log(`[review] ${item.name}: ${item.from ?? "Uncategorised"} -> ${item.to}${item.shelf ? ` / ${item.shelf}` : ""} (${item.confidence}; ${item.reason})`);
  if (!full && review.length > previewLimit) console.log(`[review] ... ${review.length - previewLimit} additional proposals omitted; rerun with --full.`);

  console.log("\nRetailer taxonomy conflicts detail:");
  for (const item of retailerConflicts.slice(0, previewLimit)) console.log(`[retailer-conflict] ${item.name}: stored ${item.stored ?? "Uncategorised"}; identity ${item.identity}; retailer ${item.retailer}${item.aisle ? ` / ${item.aisle}` : ""}`);
  if (!full && retailerConflicts.length > previewLimit) console.log(`[retailer-conflict] ... ${retailerConflicts.length - previewLimit} additional conflicts omitted; rerun with --full.`);

  console.log("\nUnresolved Other detail:");
  for (const item of unresolved.slice(0, previewLimit)) console.log(`[unresolved] ${item.name}${item.category ? ` (stored ${item.category})` : ""}`);
  if (!full && unresolved.length > previewLimit) console.log(`[unresolved] ... ${unresolved.length - previewLimit} additional products omitted; rerun with --full.`);

  if (apply && changes.length) {
    await prisma.$transaction(changes.map((change) => prisma.product.update({ where: { id: change.id }, data: { category: change.to } })));
    console.log(`Applied ${changes.length} identity-backed category corrections.`);
  } else if (!apply) {
    console.log("Preview only. Do not use --apply until the consolidated regression suite passes and the whole-catalogue correction families have been reviewed.");
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
