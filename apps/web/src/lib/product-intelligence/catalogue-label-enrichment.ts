import { EnrichmentJobStatus, Prisma, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enrichProductFromRetailerLabels } from "@/lib/product-intelligence/retailer-label-enrichment";

const provider = "australian-retailer-labels-v2";

export type CatalogueQuality = "excellent" | "good" | "fair" | "review";

export type CatalogueLabelAuditItem = {
  productId: string;
  name: string;
  productType: ProductType;
  retailers: string[];
  missing: string[];
  confidence: number;
  quality: CatalogueQuality;
};

export type CatalogueLabelAudit = {
  linkedProducts: number;
  completeProducts: number;
  needsEnrichment: number;
  missingServingSize: number;
  missingServingsPerPackage: number;
  missingNutrition: number;
  missingIngredients: number;
  missingAllergens: number;
  averageConfidence: number;
  products: CatalogueLabelAuditItem[];
};

type ProductLabelRow = {
  id: string;
  name: string;
  productType: ProductType;
  servingSize: string | null;
  servingsPerPackage: number | null;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  ingredientsText: string | null;
  allergens: string[];
  mayContainAllergens: string[];
  retailers: string[];
};

function missingFields(row: ProductLabelRow) {
  if (row.productType === ProductType.GENERIC_PRODUCE) return [];

  const missing: string[] = [];
  if (!row.servingSize) missing.push("serving-size");
  if (row.servingsPerPackage === null) missing.push("servings-per-package");
  if ([row.calories, row.proteinGrams, row.carbsGrams, row.fatGrams].every((value) => value === null)) missing.push("nutrition");
  if (!row.ingredientsText) missing.push("ingredients");
  if (!row.allergens.length && !row.mayContainAllergens.length) missing.push("allergens");
  return missing;
}

function confidenceFor(row: ProductLabelRow, missing: string[]) {
  if (row.productType === ProductType.GENERIC_PRODUCE) return 100;

  const deductions: Record<string, number> = {
    "serving-size": 15,
    "servings-per-package": 10,
    nutrition: 30,
    ingredients: 25,
    allergens: 10,
  };
  const retailerBonus = Math.min(Math.max((row.retailers?.length ?? 0) - 1, 0) * 5, 5);
  return Math.max(0, Math.min(100, 95 + retailerBonus - missing.reduce((total, field) => total + (deductions[field] ?? 5), 0)));
}

function qualityFor(confidence: number): CatalogueQuality {
  if (confidence >= 95) return "excellent";
  if (confidence >= 80) return "good";
  if (confidence >= 60) return "fair";
  return "review";
}

export async function getCatalogueLabelAudit(limit = 250): Promise<CatalogueLabelAudit> {
  const rows = await prisma.$queryRaw<ProductLabelRow[]>(Prisma.sql`
    SELECT
      p."id",
      p."name",
      p."productType",
      p."servingSize",
      p."servingsPerPackage",
      p."calories",
      p."proteinGrams",
      p."carbsGrams",
      p."fatGrams",
      p."ingredientsText",
      p."allergens",
      p."mayContainAllergens",
      array_agg(DISTINCT sp."retailer") FILTER (WHERE sp."retailer" IS NOT NULL) AS "retailers"
    FROM "Product" p
    INNER JOIN "StoreProduct" sp ON sp."productId" = p."id"
    WHERE sp."active" = true
      AND sp."productUrl" IS NOT NULL
      AND sp."retailer" IN ('Coles', 'Woolworths')
    GROUP BY p."id"
    ORDER BY p."updatedAt" ASC
    LIMIT ${limit}
  `);

  const products = rows.map((row) => {
    const missing = missingFields(row);
    const confidence = confidenceFor(row, missing);
    return {
      productId: row.id,
      name: row.name,
      productType: row.productType,
      retailers: row.retailers ?? [],
      missing,
      confidence,
      quality: qualityFor(confidence),
    };
  }).sort((left, right) => left.confidence - right.confidence || right.missing.length - left.missing.length || left.name.localeCompare(right.name));

  return {
    linkedProducts: products.length,
    completeProducts: products.filter((item) => item.missing.length === 0).length,
    needsEnrichment: products.filter((item) => item.missing.length > 0).length,
    missingServingSize: products.filter((item) => item.missing.includes("serving-size")).length,
    missingServingsPerPackage: products.filter((item) => item.missing.includes("servings-per-package")).length,
    missingNutrition: products.filter((item) => item.missing.includes("nutrition")).length,
    missingIngredients: products.filter((item) => item.missing.includes("ingredients")).length,
    missingAllergens: products.filter((item) => item.missing.includes("allergens")).length,
    averageConfidence: products.length ? Math.round(products.reduce((sum, item) => sum + item.confidence, 0) / products.length) : 0,
    products,
  };
}

export async function runCatalogueLabelEnrichmentBatch(batchSize = 20) {
  const audit = await getCatalogueLabelAudit(1000);
  const candidates = audit.products
    .filter((item) => item.missing.length > 0)
    .slice(0, Math.max(1, Math.min(batchSize, 50)));

  const results: Array<{ productId: string; name: string; status: string; error?: string }> = [];

  for (const candidate of candidates) {
    const job = await prisma.productEnrichmentJob.create({
      data: {
        productId: candidate.productId,
        provider,
        status: EnrichmentJobStatus.RUNNING,
        priority: Math.max(1, 100 - candidate.confidence),
        startedAt: new Date(),
      },
      select: { id: true },
    });

    try {
      const result = await enrichProductFromRetailerLabels(candidate.productId);
      const completed = result.status === "completed";
      await prisma.productEnrichmentJob.update({
        where: { id: job.id },
        data: {
          status: completed ? EnrichmentJobStatus.COMPLETED : EnrichmentJobStatus.FAILED,
          completedAt: new Date(),
          attempts: { increment: 1 },
          lastError: completed ? null : "No usable Coles or Woolworths label data was returned.",
        },
      });
      results.push({ productId: candidate.productId, name: candidate.name, status: result.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.productEnrichmentJob.update({
        where: { id: job.id },
        data: {
          status: EnrichmentJobStatus.FAILED,
          completedAt: new Date(),
          attempts: { increment: 1 },
          lastError: message.slice(0, 500),
        },
      }).catch(() => undefined);
      results.push({ productId: candidate.productId, name: candidate.name, status: "failed", error: message });
    }
  }

  const after = await getCatalogueLabelAudit(1000);
  return {
    processed: results.length,
    completed: results.filter((item) => item.status === "completed").length,
    failed: results.filter((item) => item.status !== "completed").length,
    remaining: after.needsEnrichment,
    averageConfidence: after.averageConfidence,
    results,
  };
}
