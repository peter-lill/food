import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { productDepartment, type SupermarketDepartment } from "../src/lib/products/product-category";
import { canRepairImportedCategory, categoryResolutionForImport, comparableProductCategoryKey, supportedRetailerCategoryPath } from "./catalogue-import-category-evidence";

const apply = process.argv.includes("--apply");
const importedRetailers = ["ALDI", "Drakes"];

type Update = {
  id: string;
  name: string;
  from: SupermarketDepartment;
  to: SupermarketDepartment;
  productType: Awaited<ReturnType<typeof categoryResolutionForImport>>["productType"];
  source: Awaited<ReturnType<typeof categoryResolutionForImport>>["source"];
};

async function main() {
  // A product is eligible only when all of its live catalogue listings came
  // from the two imports that formerly had retailer-specific keyword rules.
  // Products with Coles, Woolworths, or another retailer are left untouched.
  const [importedProducts, evidenceAliases] = await Promise.all([
    prisma.product.findMany({
      where: {
        lifecycle: { not: "ARCHIVED" },
        storeProducts: {
          some: { active: true, retailer: { in: importedRetailers } },
          none: { active: true, retailer: { notIn: importedRetailers } },
        },
      },
      select: { id: true, name: true, canonicalName: true, category: true, storeProducts: { where: { active: true }, select: { retailer: true, aisle: true } } },
      orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
    }),
    prisma.productAlias.findMany({
      where: {
        product: {
          lifecycle: { not: "ARCHIVED" },
          storeProducts: { some: { retailer: { notIn: importedRetailers } } },
        },
      },
      select: { alias: true, product: { select: { category: true } } },
    }),
  ]);

  const comparableCategories = new Map<string, Set<SupermarketDepartment>>();
  for (const alias of evidenceAliases) {
    const key = comparableProductCategoryKey(alias.alias);
    const category = productDepartment(alias.product.category, "");
    if (!key || category === "Other") continue;
    const categories = comparableCategories.get(key) ?? new Set<SupermarketDepartment>();
    categories.add(category);
    comparableCategories.set(key, categories);
  }

  const updates: Update[] = [];
  let skippedNameOnly = 0;
  for (const product of importedProducts) {
    const name = product.canonicalName ?? product.name;
    const from = productDepartment(product.category, "");
    const retailerPath = supportedRetailerCategoryPath(name, product.storeProducts.map((listing) => listing.aisle), from);
    const resolved = categoryResolutionForImport(name, comparableCategories, retailerPath);
    // Historical product titles often contain ingredients, flavours, and use
    // cases. A name-only conclusion is never enough to rewrite an established
    // category ("dog food with beef", "lemon cleaner", and "apple jelly" are
    // representative false positives). A first-level retailer department is
    // authoritative, including an explicit general-merchandise/Other path, as
    // is a unanimous comparable-product family.
    if (resolved.source === "unclassified") {
      skippedNameOnly += 1;
      continue;
    }
    if (!canRepairImportedCategory(resolved, from)) continue;
    updates.push({ id: product.id, name, from, to: resolved.category, productType: resolved.productType, source: resolved.source });
  }

  const sourceCounts = Object.fromEntries(
    [...new Set(updates.map((update) => update.source))].map((source) => [source, updates.filter((update) => update.source === source).length]),
  );
  console.log(`${apply ? "Updating" : "Would update"} ${updates.length} ALDI/Drakes-only product categor${updates.length === 1 ? "y" : "ies"}.`);
  console.log(`Category evidence: ${JSON.stringify(sourceCounts)}.`);
  console.log(`Skipped ${skippedNameOnly} name-only candidates; they require stronger category evidence.`);
  for (const update of updates.slice(0, 100)) {
    console.log(`${update.from} -> ${update.to} [${update.source}] ${update.name}`);
  }
  if (updates.length > 100) console.log(`…and ${updates.length - 100} more.`);
  if (!apply) {
    console.log("No database changes were made. Review the preview, then rerun with --apply.");
    return;
  }

  for (const update of updates) {
    await prisma.product.update({ where: { id: update.id }, data: { category: update.to, productType: update.productType } });
  }
  console.log("Imported product categories reconciled.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
