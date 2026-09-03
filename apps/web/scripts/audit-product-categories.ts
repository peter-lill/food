import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { productDepartment, retailerPathDepartment, supermarketDepartments, type SupermarketDepartment } from "../src/lib/products/product-category";
import { categoryResolutionForImport, comparableProductCategoryKey, unanimousRetailerCategoryPath } from "./catalogue-import-category-evidence";
import { isProductTypeCompatibleWithDepartment } from "./product-category-audit-policy";

const strict = process.argv.includes("--strict");
const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="))?.slice("--limit=".length);
const limit = Number.isInteger(Number(limitArgument)) && Number(limitArgument) > 0 ? Number(limitArgument) : 100;
const importedRetailers = new Set(["ALDI", "Drakes"]);

type FindingCode = "INVALID_CATEGORY" | "PRODUCT_TYPE_MISMATCH" | "UNCLASSIFIED" | "UNVERIFIED_IMPORTED_CATEGORY";
type Finding = { code: FindingCode; id: string; name: string; detail: string };

function isCanonicalStoredCategory(value: string | null, category: SupermarketDepartment) {
  return value === category && supermarketDepartments.includes(category);
}

async function main() {
  const products = await prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" } },
    select: {
      id: true, name: true, canonicalName: true, category: true, productType: true,
      barcode: true,
      aliases: { select: { source: true } },
      storeProducts: { where: { active: true }, select: { retailer: true, aisle: true } },
    },
    orderBy: [{ category: "asc" }, { canonicalName: "asc" }, { name: "asc" }],
  });
  const evidenceAliases = await prisma.productAlias.findMany({
    where: {
      product: {
        lifecycle: { not: "ARCHIVED" },
        storeProducts: { some: { retailer: { notIn: [...importedRetailers] } } },
      },
    },
    select: { alias: true, product: { select: { category: true } } },
  });
  const comparableCategories = new Map<string, Set<SupermarketDepartment>>();
  for (const alias of evidenceAliases) {
    const key = comparableProductCategoryKey(alias.alias);
    const category = productDepartment(alias.product.category, "");
    if (!key || category === "Other") continue;
    const candidates = comparableCategories.get(key) ?? new Set<SupermarketDepartment>();
    candidates.add(category);
    comparableCategories.set(key, candidates);
  }

  const findings: Finding[] = [];
  const categories = new Map<string, number>();
  const sources = new Map<string, number>();

  for (const product of products) {
    const name = product.canonicalName ?? product.name;
    const category = productDepartment(product.category, "");
    categories.set(product.category ?? "(missing)", (categories.get(product.category ?? "(missing)") ?? 0) + 1);
    for (const alias of product.aliases) {
      if (alias.source) sources.set(alias.source, (sources.get(alias.source) ?? 0) + 1);
    }

    if (!isCanonicalStoredCategory(product.category, category)) {
      findings.push({
        code: "INVALID_CATEGORY", id: product.id, name,
        detail: `stored=${JSON.stringify(product.category)} normalises to ${JSON.stringify(category)}`,
      });
    }

    if (!isProductTypeCompatibleWithDepartment(category, product.productType)) {
      findings.push({
        code: "PRODUCT_TYPE_MISMATCH", id: product.id, name,
        detail: `category=${category}; productType=${product.productType}`,
      });
    }

    const retailerPathCategories = product.storeProducts.map((listing) => retailerPathDepartment(listing.aisle));
    const hasAuthoritativeOtherPath = retailerPathCategories.some((pathCategory) => pathCategory === "Other");
    if (category === "Other" && !hasAuthoritativeOtherPath) {
      findings.push({
        code: "UNCLASSIFIED", id: product.id, name,
        detail: `productType=${product.productType}; no recognised retailer category path establishes this catch-all category`,
      });
    }

    const retailers = new Set(product.storeProducts.map((listing) => listing.retailer));
    const importedOnly = retailers.size > 0 && [...retailers].every((retailer) => importedRetailers.has(retailer));
    const hasImportedAlias = product.aliases.some((alias) => alias.source === "aldi-controlled-import" || alias.source === "drakes-controlled-import");
    const retailerPath = unanimousRetailerCategoryPath(product.storeProducts.map((listing) => listing.aisle));
    const comparable = categoryResolutionForImport(name, comparableCategories, retailerPath);
    const categoryEvidenceMatches = (comparable.source === "retailer-path" || comparable.source === "comparable-product") && comparable.category === category;
    if (importedOnly && hasImportedAlias && category !== "Other" && !product.barcode && !categoryEvidenceMatches) {
      const pathState = retailerPath
        ? "retailer paths disagree"
        : retailerPathCategories.some((pathCategory) => pathCategory === "Other")
          ? "retailer paths establish only the catch-all Other department"
          : "no recognised retailer category path is stored";
      findings.push({
        code: "UNVERIFIED_IMPORTED_CATEGORY", id: product.id, name,
        detail: `category=${category}; retailers=${[...retailers].sort().join(",")}; ${pathState}; requires a barcode, comparable product, or retailer-path evidence`,
      });
    }
  }

  console.log("Product category audit");
  console.log(`Products reviewed: ${products.length}`);
  console.log(`Stored category distribution: ${JSON.stringify(Object.fromEntries([...categories.entries()].sort(([left], [right]) => left.localeCompare(right))))}`);
  console.log(`Alias source distribution: ${JSON.stringify(Object.fromEntries([...sources.entries()].sort(([left], [right]) => left.localeCompare(right))))}`);
  for (const code of ["INVALID_CATEGORY", "PRODUCT_TYPE_MISMATCH", "UNCLASSIFIED", "UNVERIFIED_IMPORTED_CATEGORY"] as const) {
    console.log(`${code}: ${findings.filter((finding) => finding.code === code).length}`);
  }

  for (const finding of findings.slice(0, limit)) {
    console.log(`[${finding.code}] ${finding.name} (${finding.id}) — ${finding.detail}`);
  }
  if (findings.length > limit) console.log(`…and ${findings.length - limit} more. Use --limit=N to inspect more.`);
  console.log("This command is read-only. No database changes were made.");

  if (strict && findings.length) process.exitCode = 2;
}

void main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
