import { ProductLifecycle, ProductType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateProductName } from "@/lib/product-intelligence/product-name-quality";

export type QualitySeverity = "error" | "warning" | "info";

export type ProductQualityIssue = {
  code: string;
  label: string;
  severity: QualitySeverity;
  field: string;
  repairable: boolean;
};

export type ProductQualityInspection = {
  productId: string;
  name: string;
  sanitisedName: string | null;
  productType: ProductType;
  lifecycle: ProductLifecycle;
  score: number;
  state: "verified" | "enriched" | "review" | "incomplete" | "broken";
  passed: string[];
  issues: ProductQualityIssue[];
  retailerCount: number;
  activeRetailerLinks: number;
  latestEnrichment: {
    provider: string;
    status: string;
    completedAt: Date | null;
    lastError: string | null;
  } | null;
};

type ProductQualityRow = {
  id: string;
  name: string;
  canonicalName: string | null;
  brand: string | null;
  barcode: string | null;
  category: string | null;
  imageUrl: string | null;
  servingSize: string | null;
  servingsPerPackage: number | null;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  ingredientsText: string | null;
  allergens: string[];
  mayContainAllergens: string[];
  productType: ProductType;
  lifecycle: ProductLifecycle;
  retailerCount: number;
  activeRetailerLinks: number;
};

function issue(code: string, label: string, severity: QualitySeverity, field: string, repairable = false): ProductQualityIssue {
  return { code, label, severity, field, repairable };
}

function uniqueIssues(items: ProductQualityIssue[]) {
  return [...new Map(items.map((item) => [item.code, item])).values()];
}

function isProduce(type: ProductType) {
  return type === ProductType.GENERIC_PRODUCE;
}

function inspectRow(row: ProductQualityRow) {
  const nameResult = validateProductName(row.name || row.canonicalName);
  const produce = isProduce(row.productType);
  const issues: ProductQualityIssue[] = [];
  const passed: string[] = [];

  if (!nameResult.valid) issues.push(issue("name-invalid", "Product name is invalid", "error", "name", true));
  else if (nameResult.changed) issues.push(issue("name-needs-repair", "Product name can be repaired", "warning", "name", true));
  else passed.push("Clean product name");

  if (!row.category) issues.push(issue("category-missing", "Category is missing", "warning", "category"));
  else passed.push("Category recorded");

  if (!produce && !row.brand) issues.push(issue("brand-missing", "Brand is missing", "warning", "brand"));
  else passed.push(produce ? "Brand not required for produce" : "Brand recorded");

  if (!produce && !row.barcode) issues.push(issue("barcode-missing", "Barcode is missing", "info", "barcode"));
  else passed.push(produce ? "Barcode not required for produce" : "Barcode recorded");

  if (!row.imageUrl) issues.push(issue("image-missing", "Product image is missing", "warning", "imageUrl"));
  else passed.push("Product image recorded");

  if (!produce) {
    if (!row.servingSize) issues.push(issue("serving-size-missing", "Serving size is missing", "error", "servingSize"));
    else passed.push("Serving size recorded");

    if (row.servingsPerPackage === null) issues.push(issue("servings-per-package-missing", "Servings per package is missing", "warning", "servingsPerPackage"));
    else if (row.servingsPerPackage <= 0 || row.servingsPerPackage > 500) issues.push(issue("servings-per-package-invalid", "Servings per package is implausible", "error", "servingsPerPackage"));
    else passed.push("Servings per package recorded");

    const nutrition = [row.calories, row.proteinGrams, row.carbsGrams, row.fatGrams];
    if (nutrition.every((value) => value === null)) issues.push(issue("nutrition-missing", "Nutrition information is missing", "error", "nutrition"));
    else if (nutrition.some((value) => value !== null && value < 0)) issues.push(issue("nutrition-invalid", "Nutrition contains a negative value", "error", "nutrition"));
    else passed.push("Nutrition recorded");

    if (!row.ingredientsText?.trim()) issues.push(issue("ingredients-missing", "Ingredients are missing", "error", "ingredientsText"));
    else if (/^(?:n\/?a|not available|coming soon|unknown)$/i.test(row.ingredientsText.trim())) issues.push(issue("ingredients-placeholder", "Ingredients contain placeholder text", "error", "ingredientsText"));
    else passed.push("Ingredients recorded");

    if (!row.allergens.length && !row.mayContainAllergens.length) issues.push(issue("allergens-missing", "Allergen statements are missing", "warning", "allergens"));
    else passed.push("Allergen information recorded");
  } else {
    passed.push("Produce label rules applied");
  }

  if (!row.activeRetailerLinks) issues.push(issue("retailer-link-missing", "No active retailer product link", "warning", "storeProducts"));
  else passed.push("Active retailer link recorded");

  const deduped = uniqueIssues(issues);
  const penalty = deduped.reduce((total, item) => total + (item.severity === "error" ? 15 : item.severity === "warning" ? 7 : 3), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const state = deduped.some((item) => item.code === "name-invalid")
    ? "broken"
    : deduped.some((item) => item.severity === "error")
      ? "review"
      : deduped.length
        ? "incomplete"
        : row.lifecycle === ProductLifecycle.READY
          ? "verified"
          : "enriched";

  return { score, state, issues: deduped, passed, sanitisedName: nameResult.sanitised } as const;
}

export async function inspectProductQuality(productId: string): Promise<ProductQualityInspection | null> {
  const rows = await prisma.$queryRaw<ProductQualityRow[]>(Prisma.sql`
    SELECT
      p."id", p."name", p."canonicalName", p."brand", p."barcode", p."category", p."imageUrl",
      p."servingSize", p."servingsPerPackage", p."calories", p."proteinGrams", p."carbsGrams", p."fatGrams",
      p."ingredientsText", p."allergens", p."mayContainAllergens", p."productType", p."lifecycle",
      COUNT(DISTINCT sp."retailer")::int AS "retailerCount",
      COUNT(DISTINCT sp."id") FILTER (WHERE sp."active" = true AND sp."productUrl" IS NOT NULL)::int AS "activeRetailerLinks"
    FROM "Product" p
    LEFT JOIN "StoreProduct" sp ON sp."productId" = p."id"
    WHERE p."id" = ${productId}
    GROUP BY p."id"
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;

  const latestEnrichment = await prisma.productEnrichmentJob.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
    select: { provider: true, status: true, completedAt: true, lastError: true },
  });
  const result = inspectRow(row);

  return {
    productId: row.id,
    name: row.name,
    sanitisedName: result.sanitisedName,
    productType: row.productType,
    lifecycle: row.lifecycle,
    score: result.score,
    state: result.state,
    passed: result.passed,
    issues: result.issues,
    retailerCount: row.retailerCount,
    activeRetailerLinks: row.activeRetailerLinks,
    latestEnrichment: latestEnrichment ? {
      ...latestEnrichment,
      status: String(latestEnrichment.status),
    } : null,
  };
}

export async function getCatalogueQualityMetrics(limit = 5000) {
  const rows = await prisma.$queryRaw<ProductQualityRow[]>(Prisma.sql`
    SELECT
      p."id", p."name", p."canonicalName", p."brand", p."barcode", p."category", p."imageUrl",
      p."servingSize", p."servingsPerPackage", p."calories", p."proteinGrams", p."carbsGrams", p."fatGrams",
      p."ingredientsText", p."allergens", p."mayContainAllergens", p."productType", p."lifecycle",
      COUNT(DISTINCT sp."retailer")::int AS "retailerCount",
      COUNT(DISTINCT sp."id") FILTER (WHERE sp."active" = true AND sp."productUrl" IS NOT NULL)::int AS "activeRetailerLinks"
    FROM "Product" p
    LEFT JOIN "StoreProduct" sp ON sp."productId" = p."id"
    GROUP BY p."id"
    ORDER BY p."updatedAt" DESC
    LIMIT ${Math.max(1, Math.min(limit, 10000))}
  `);

  const inspected = rows.map((row) => ({ row, result: inspectRow(row) }));
  const issueCounts = new Map<string, number>();
  for (const item of inspected) {
    for (const qualityIssue of item.result.issues) {
      issueCounts.set(qualityIssue.code, (issueCounts.get(qualityIssue.code) ?? 0) + 1);
    }
  }

  return {
    products: inspected.length,
    averageScore: inspected.length ? Math.round(inspected.reduce((sum, item) => sum + item.result.score, 0) / inspected.length) : 0,
    verified: inspected.filter((item) => item.result.state === "verified").length,
    enriched: inspected.filter((item) => item.result.state === "enriched").length,
    incomplete: inspected.filter((item) => item.result.state === "incomplete").length,
    review: inspected.filter((item) => item.result.state === "review").length,
    broken: inspected.filter((item) => item.result.state === "broken").length,
    issues: [...issueCounts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    weakest: inspected
      .sort((a, b) => a.result.score - b.result.score || a.row.name.localeCompare(b.row.name))
      .slice(0, 100)
      .map(({ row, result }) => ({ productId: row.id, name: row.name, score: result.score, state: result.state, issues: result.issues })),
  };
}
