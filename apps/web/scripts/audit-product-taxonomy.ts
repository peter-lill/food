import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { classifyProductText, productDepartment } from "../src/lib/products/product-category";

const apply = process.argv.includes("--apply");

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, canonicalName: true, category: true, storeProducts: { select: { retailer: true, retailerProductName: true, aisle: true } } },
    orderBy: { name: "asc" },
  });
  const changes: Array<{ id: string; name: string; from: string | null; to: string; shelf: string | null; confidence: string; reason: string }> = [];
  const counts = new Map<string, number>();

  for (const product of products) {
    const retailerEvidence = product.storeProducts.map((listing) => `${listing.retailerProductName} ${listing.aisle ?? ""}`).join(" ");
    const identity = [product.canonicalName, product.name, retailerEvidence].filter(Boolean).join(" ");
    const classification = classifyProductText(identity);
    const effective = productDepartment(product.category, identity);
    counts.set(effective, (counts.get(effective) ?? 0) + 1);

    // Automatic repair is intentionally conservative. High-confidence rules may
    // repair Other or legacy Pantry; authoritative non-Pantry categories are not
    // overwritten by name heuristics alone.
    if (classification.confidence === "high" && classification.department !== "Other" && effective !== product.category && (!product.category || product.category === "Other" || product.category === "Pantry")) {
      changes.push({ id: product.id, name: product.canonicalName ?? product.name, from: product.category, to: effective, shelf: classification.shelf, confidence: classification.confidence, reason: classification.reason });
    }
  }

  console.log(`Catalogue taxonomy audit: ${products.length} products.`);
  console.log(`Effective department counts: ${JSON.stringify(Object.fromEntries([...counts].sort()))}`);
  console.log(`Conservative corrections: ${changes.length}`);
  for (const change of changes) console.log(`${change.name}: ${change.from ?? "Uncategorised"} -> ${change.to}${change.shelf ? ` / ${change.shelf}` : ""} (${change.reason})`);

  if (apply && changes.length) {
    await prisma.$transaction(changes.map((change) => prisma.product.update({ where: { id: change.id }, data: { category: change.to } })));
    console.log(`Applied ${changes.length} category corrections.`);
  } else if (!apply) {
    console.log("Preview only. Re-run with --apply after reviewing the proposed corrections.");
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
