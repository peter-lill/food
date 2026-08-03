import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCatalogueHealth } from "@/lib/product-intelligence/apke-quality";

export type CatalogueHealthDetail = Awaited<ReturnType<typeof getCatalogueHealth>> & {
  gold: number;
  provisionalGtins: number;
  verifiedGtins: number;
  missingGtins: number;
  missingAllergens: number;
  missingServingsPerPackage: number;
  missingRetailerLinks: number;
  queuedRepairs: number;
  failedRepairs: number;
};

export type CatalogueReviewItem = {
  productId: string;
  slug: string | null;
  name: string;
  brand: string | null;
  packSize: string | null;
  barcode: string | null;
  lifecycle: string;
  overallScore: number | null;
  identityScore: number | null;
  nutritionScore: number | null;
  labelScore: number | null;
  retailScore: number | null;
  imageScore: number | null;
  missingFields: string[];
  issues: string[];
  repairReasons: string[];
  repairStatuses: string[];
  priority: number;
  lastError: string | null;
  gtinStatus: string | null;
  updatedAt: Date;
};

export type ReviewFilter = "all" | "review" | "queued" | "failed" | "identity" | "nutrition" | "label" | "retail" | "image";

export async function getCatalogueHealthDetail(): Promise<CatalogueHealthDetail> {
  const base = await getCatalogueHealth();
  const rows = await prisma.$queryRaw<Array<{
    gold: bigint;
    provisionalGtins: bigint;
    verifiedGtins: bigint;
    missingGtins: bigint;
    missingAllergens: bigint;
    missingServingsPerPackage: bigint;
    missingRetailerLinks: bigint;
    queuedRepairs: bigint;
    failedRepairs: bigint;
  }>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM "ProductQualitySnapshot" q WHERE q."overallScore" >= 98 AND cardinality(q."issues") = 0 AND cardinality(q."missingFields") = 0) AS gold,
      (SELECT COUNT(*) FROM "ProductGtinIdentity" WHERE "status" = 'PROVISIONAL') AS "provisionalGtins",
      (SELECT COUNT(*) FROM "ProductGtinIdentity" WHERE "status" = 'VERIFIED') AS "verifiedGtins",
      (SELECT COUNT(*) FROM "Product" p WHERE p."lifecycle" <> 'ARCHIVED' AND p."productType" = 'PACKAGED' AND p."barcode" IS NULL) AS "missingGtins",
      (SELECT COUNT(*) FROM "ProductQualitySnapshot" q WHERE 'containsAllergens' = ANY(q."missingFields")) AS "missingAllergens",
      (SELECT COUNT(*) FROM "ProductQualitySnapshot" q WHERE 'servingsPerPackage' = ANY(q."missingFields")) AS "missingServingsPerPackage",
      (SELECT COUNT(*) FROM "ProductQualitySnapshot" q WHERE 'retailerProductUrl' = ANY(q."missingFields")) AS "missingRetailerLinks",
      (SELECT COUNT(*) FROM "ProductRepairItem" WHERE "status" IN ('QUEUED', 'RUNNING', 'REVIEW_REQUIRED')) AS "queuedRepairs",
      (SELECT COUNT(*) FROM "ProductRepairItem" WHERE "status" = 'FAILED') AS "failedRepairs"
  `);
  const row = rows[0];
  return {
    ...base,
    gold: Number(row?.gold ?? 0),
    provisionalGtins: Number(row?.provisionalGtins ?? 0),
    verifiedGtins: Number(row?.verifiedGtins ?? 0),
    missingGtins: Number(row?.missingGtins ?? 0),
    missingAllergens: Number(row?.missingAllergens ?? 0),
    missingServingsPerPackage: Number(row?.missingServingsPerPackage ?? 0),
    missingRetailerLinks: Number(row?.missingRetailerLinks ?? 0),
    queuedRepairs: Number(row?.queuedRepairs ?? 0),
    failedRepairs: Number(row?.failedRepairs ?? 0),
  };
}

function filterSql(filter: ReviewFilter) {
  switch (filter) {
    case "review": return Prisma.sql`AND (p."lifecycle" = 'REVIEW_REQUIRED' OR 'REVIEW_REQUIRED' = ANY(rr."statuses") OR cardinality(COALESCE(q."issues", ARRAY[]::text[])) > 0)`;
    case "queued": return Prisma.sql`AND (('QUEUED' = ANY(rr."statuses")) OR ('RUNNING' = ANY(rr."statuses")))`;
    case "failed": return Prisma.sql`AND 'FAILED' = ANY(rr."statuses")`;
    case "identity": return Prisma.sql`AND (g."status" = 'CONFLICT' OR COALESCE(q."identityScore", 100) < 100)`;
    case "nutrition": return Prisma.sql`AND COALESCE(q."nutritionScore", 100) < 100`;
    case "label": return Prisma.sql`AND COALESCE(q."labelScore", 100) < 100`;
    case "retail": return Prisma.sql`AND COALESCE(q."retailScore", 100) < 100`;
    case "image": return Prisma.sql`AND COALESCE(q."imageScore", 100) < 100`;
    default: return Prisma.empty;
  }
}

export async function getCatalogueReviewQueue(filter: ReviewFilter = "all", limit = 200): Promise<CatalogueReviewItem[]> {
  const rows = await prisma.$queryRaw<Array<{
    productId: string;
    slug: string | null;
    name: string;
    brand: string | null;
    packSize: string | null;
    barcode: string | null;
    lifecycle: string;
    overallScore: number | null;
    identityScore: number | null;
    nutritionScore: number | null;
    labelScore: number | null;
    retailScore: number | null;
    imageScore: number | null;
    missingFields: string[];
    issues: string[];
    repairReasons: string[];
    repairStatuses: string[];
    priority: number | null;
    lastError: string | null;
    gtinStatus: string | null;
    updatedAt: Date;
  }>>(Prisma.sql`
    SELECT
      p."id" AS "productId", p."slug", p."name", p."brand", p."packSize", p."barcode", p."lifecycle"::text,
      q."overallScore", q."identityScore", q."nutritionScore", q."labelScore", q."retailScore", q."imageScore",
      COALESCE(q."missingFields", ARRAY[]::text[]) AS "missingFields",
      COALESCE(q."issues", ARRAY[]::text[]) AS "issues",
      rr."reasons" AS "repairReasons",
      rr."statuses" AS "repairStatuses",
      rr."priority",
      rr."lastError",
      g."status"::text AS "gtinStatus",
      GREATEST(p."updatedAt", COALESCE(rr."updatedAt", p."updatedAt"), COALESCE(q."calculatedAt", p."updatedAt")) AS "updatedAt"
    FROM "Product" p
    LEFT JOIN "ProductQualitySnapshot" q ON q."productId" = p."id"
    LEFT JOIN "ProductGtinIdentity" g ON g."productId" = p."id"
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(array_agg(DISTINCT r."reason") FILTER (WHERE r."reason" IS NOT NULL), ARRAY[]::text[]) AS reasons,
        COALESCE(array_agg(DISTINCT r."status"::text) FILTER (WHERE r."status" IS NOT NULL), ARRAY[]::text[]) AS statuses,
        MIN(r."priority") AS priority,
        MAX(r."lastError") AS "lastError",
        MAX(r."updatedAt") AS "updatedAt",
        COUNT(*) AS count
      FROM "ProductRepairItem" r
      WHERE r."productId" = p."id" AND r."status" IN ('QUEUED', 'RUNNING', 'REVIEW_REQUIRED', 'FAILED')
    ) rr ON true
    WHERE p."lifecycle" <> 'ARCHIVED'
      AND (q."overallScore" < 100 OR cardinality(COALESCE(q."issues", ARRAY[]::text[])) > 0 OR rr.count > 0 OR p."lifecycle" = 'REVIEW_REQUIRED')
      ${filterSql(filter)}
    ORDER BY
      CASE WHEN p."lifecycle" = 'REVIEW_REQUIRED' OR g."status" = 'CONFLICT' THEN 0 ELSE 1 END,
      COALESCE(rr."priority", 999),
      COALESCE(q."overallScore", 0),
      p."name"
    LIMIT ${Math.max(1, Math.min(limit, 500))}
  `);

  return rows.map((row) => ({
    ...row,
    missingFields: row.missingFields ?? [],
    issues: row.issues ?? [],
    repairReasons: row.repairReasons ?? [],
    repairStatuses: row.repairStatuses ?? [],
    priority: row.priority ?? 999,
  }));
}
