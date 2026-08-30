import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { classifyProduct, classifyProductText, productDepartment } from "../src/lib/products/product-category";

const apply = process.argv.includes("--apply");

type Proposal = { id: string; name: string; from: string | null; to: string; shelf: string | null; confidence: string; reason: string };

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, canonicalName: true, category: true, storeProducts: { select: { retailer: true, retailerProductName: true, aisle: true } } },
    orderBy: { name: "asc" },
  });
  const changes: Proposal[] = [];
  const review: Proposal[] = [];
  const unresolved: Array<{ name: string; category: string | null }> = [];
  const counts = new Map<string, number>();

  for (const product of products) {
    const name = product.canonicalName ?? product.name;
    const nameClassification = classifyProductText(name);
    const retailerClassifications = product.storeProducts.map((listing) => classifyProduct({
      name: listing.retailerProductName || name,
      storedCategory: product.category,
      retailer: listing.retailer,
      aisle: listing.aisle,
    }));
    const authoritative = retailerClassifications.find((item) => item.confidence === "authoritative" && item.department !== "Other");
    const classification = authoritative ?? nameClassification;
    const effective = authoritative?.department ?? productDepartment(product.category, name);
    counts.set(effective, (counts.get(effective) ?? 0) + 1);

    const differs = classification.department !== "Other" && effective !== product.category;
    const proposal: Proposal = { id: product.id, name, from: product.category, to: effective, shelf: classification.shelf, confidence: classification.confidence, reason: classification.reason };

    // Only authoritative retailer taxonomy can automatically replace an existing
    // canonical category. High-confidence name identity may repair empty/Other
    // records, but legacy Pantry moves remain review-only until explicitly vetted.
    if (differs && classification.confidence === "authoritative") {
      changes.push(proposal);
    } else if (differs && classification.confidence === "high" && (!product.category || product.category === "Other")) {
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

  console.log(`Unresolved Other: ${unresolved.length}`);
  for (const item of unresolved.slice(0, 200)) console.log(`[unresolved] ${item.name}${item.category ? ` (stored ${item.category})` : ""}`);
  if (unresolved.length > 200) console.log(`[unresolved] ... ${unresolved.length - 200} additional products omitted from console output.`);

  if (apply && changes.length) {
    await prisma.$transaction(changes.map((change) => prisma.product.update({ where: { id: change.id }, data: { category: change.to } })));
    console.log(`Applied ${changes.length} high-confidence category corrections.`);
  } else if (!apply) {
    console.log("Preview only. Do not use --apply until the regression suite passes and the high-confidence list has been reviewed.");
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
