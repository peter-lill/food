import { parseProductName } from "@/lib/products/product-normalisation";

export type CatalogueQualityProduct = {
  id: string;
  name: string;
  canonicalName: string | null;
  brand: string | null;
  barcode: string | null;
  category: string | null;
  imageUrl: string | null;
  packSize: string | null;
  aliases: Array<{ normalised: string }>;
};

export type CatalogueQualityIssue = {
  code: string;
  severity: "high" | "medium" | "low";
  message: string;
};

const retailerPattern = /\b(?:coles|woolworths|aldi|costco)\b/i;
const packPattern = /\b\d+(?:\.\d+)?\s*(?:kg|g|gram|grams|ml|l)\b/i;
const abbreviationPattern = /\b(?:slcd|b00gram)\b/i;
const suspiciousImagePattern = /(?:pie|recipe|placeholder|logo|banner|sprite)/i;
const producePattern = /\b(?:broccoli|carrot|garlic|lemon|mushroom|onion|sweet potato|tomato|capsicum|potato|zucchini)\b/i;

export function canonicalIdentity(product: Pick<CatalogueQualityProduct, "name" | "canonicalName">) {
  const raw = parseProductName(product.name);
  const canonical = product.canonicalName ? parseProductName(product.canonicalName) : null;
  return raw.canonicalKey.length <= (canonical?.canonicalKey.length ?? Number.MAX_SAFE_INTEGER)
    ? raw
    : canonical!;
}

export function qualityIssues(product: CatalogueQualityProduct): CatalogueQualityIssue[] {
  const issues: CatalogueQualityIssue[] = [];
  const identity = canonicalIdentity(product);

  if (retailerPattern.test(product.name)) issues.push({ code: "RETAILER_IN_NAME", severity: "medium", message: "Retailer text belongs in an alias or store listing." });
  if (packPattern.test(product.name)) issues.push({ code: "PACK_SIZE_IN_NAME", severity: "medium", message: "Pack size should be stored separately." });
  if (abbreviationPattern.test(product.name)) issues.push({ code: "RECEIPT_ABBREVIATION", severity: "medium", message: "Receipt abbreviation remains in the product name." });
  if (producePattern.test(identity.canonicalName) && !product.category) issues.push({ code: "UNCATEGORISED_PRODUCE", severity: "low", message: "Fresh produce has no category." });
  if (product.imageUrl && suspiciousImagePattern.test(product.imageUrl)) issues.push({ code: "SUSPICIOUS_IMAGE", severity: "high", message: "The saved image appears unrelated or is a placeholder." });
  if (!product.aliases.some((alias) => alias.normalised === parseProductName(product.name).canonicalKey.replaceAll("-", " "))) {
    issues.push({ code: "MISSING_RAW_ALIAS", severity: "low", message: "Original product wording is not preserved as an alias." });
  }
  if (!product.imageUrl) issues.push({ code: "MISSING_IMAGE", severity: "low", message: "No product image is available." });

  return issues;
}

export function qualityScore(product: CatalogueQualityProduct) {
  const deductions = qualityIssues(product).reduce((total, issue) => total + (issue.severity === "high" ? 35 : issue.severity === "medium" ? 15 : 5), 0);
  return Math.max(0, 100 - deductions);
}

export function duplicateGroups(products: CatalogueQualityProduct[]) {
  const groups = new Map<string, CatalogueQualityProduct[]>();
  for (const product of products) {
    const key = canonicalIdentity(product).canonicalKey;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, canonicalName: canonicalIdentity(group[0]).canonicalName, products: group }));
}
