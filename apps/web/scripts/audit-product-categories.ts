import "dotenv/config";

import { ProductType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { productDepartment, supermarketDepartments, type SupermarketDepartment } from "../src/lib/products/product-category";
import { categoryResolutionForImport, comparableProductCategoryKey } from "./catalogue-import-category-evidence";

const strict = process.argv.includes("--strict");
const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="))?.slice("--limit=".length);
const limit = Number.isInteger(Number(limitArgument)) && Number(limitArgument) > 0 ? Number(limitArgument) : 100;
const importedRetailers = new Set(["ALDI", "Drakes"]);

type FindingCode = "INVALID_CATEGORY" | "PRODUCT_TYPE_MISMATCH" | "UNCLASSIFIED" | "UNVERIFIED_IMPORTED_CATEGORY";
type Finding = { code: FindingCode; id: string; name: string; detail: string };

function expectedProductTypes(category: SupermarketDepartment) {
  switch (category) {
    case "Fruit & vegetables": return new Set([ProductType.GENERIC_PRODUCE]);
    case "Bakery": return new Set([ProductType.BAKERY]);
    case "Meat & seafood": return new Set([ProductType.FRESH_MEAT, ProductType.SEAFOOD]);
    case "Dairy & eggs": return new Set([ProductType.DAIRY]);
    case "Frozen": return new Set([ProductType.FROZEN]);
    case "Drinks": return new Set([ProductType.BEVERAGE]);
    case "Health & personal care": return new Set([ProductType.PERSONAL_CARE]);
    case "Household": return new Set([ProductType.HOUSEHOLD]);
    case "Deli":
    case "Pantry":
    case "Confectionery":
    case "Baby":
    case "Pet": return new Set([ProductType.PACKAGED]);
    case "Other": return new Set([ProductType.OTHER]);
  }
}

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
      storeProducts: { where: { active: true }, select: { retailer: true } },
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

    if (!expectedProductTypes(category).has(product.productType)) {
      findings.push({
        code: "PRODUCT_TYPE_MISMATCH", id: product.id, name,
        detail: `category=${category}; productType=${product.productType}`,
      });
    }

    if (category === "Other") {
      findings.push({ code: "UNCLASSIFIED", id: product.id, name, detail: `productType=${product.productType}` });
    }

    const retailers = new Set(product.storeProducts.map((listing) => listing.retailer));
    const importedOnly = retailers.size > 0 && [...retailers].every((retailer) => importedRetailers.has(retailer));
    const hasImportedAlias = product.aliases.some((alias) => alias.source === "aldi-controlled-import" || alias.source === "drakes-controlled-import");
    const comparable = categoryResolutionForImport(name, comparableCategories);
    const comparableEvidenceMatches = comparable.source === "comparable-product" && comparable.category === category;
    if (importedOnly && hasImportedAlias && category !== "Other" && !product.barcode && !comparableEvidenceMatches) {
      findings.push({
        code: "UNVERIFIED_IMPORTED_CATEGORY", id: product.id, name,
        detail: `category=${category}; retailers=${[...retailers].sort().join(",")}; requires comparable-product, barcode/manual, or retailer-path evidence`,
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
