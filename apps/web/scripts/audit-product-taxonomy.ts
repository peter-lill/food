import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { classifyProductText, productDepartment } from "../src/lib/products/product-category";

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
    const retailerEvidence = product.storeProducts.map((listing) => `${listing.retailerProductName} ${listing.aisle ?? ""}`).join(" ");
    const identity = [product.canonicalName, product.name, retailerEvidence].filter(Boolean).join(" ");
    const classification = classifyProductText(identity);
    const effective = productDepartment(product.category, identity);
    counts.set(effective, (counts.get(effective) ?? 0) + 1);

    const differs = classification.department !== "Other" && effective !== product.category;
    const proposal: Proposal = { id: product.id, name: product.canonicalName ?? product.name, from: product.category, to: effective, shelf: classification.shelf, confidence: classification.confidence, reason: classification.reason };

    // Automatic repair remains deliberately narrow: only high-confidence identity
    // evidence may repair uncategorised/Other records or legacy Pantry. Existing
    // canonical non-Pantry departments are never overwritten by name heuristics.
    if (differs && classification.confidence === "high" && (!product.category || product.category === "Other" || product.category === "Pantry")) {
      changes.push(proposal);
    } else if (differs) {
      review.push(proposal);
    }

    if (effective === "Other") unresolved.push({ name: product.canonicalName ?? product.name, category: product.category });
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
