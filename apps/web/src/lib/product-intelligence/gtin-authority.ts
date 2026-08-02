import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type GtinIdentityInput = {
  productId: string;
  gtin: string;
  canonicalName?: string | null;
  brand?: string | null;
  packSize?: string | null;
  source: string;
  sourceUrl?: string | null;
  confidence?: number;
  verified?: boolean;
};

export type GtinClaimResult =
  | { status: "claimed" | "updated"; productId: string; gtin: string }
  | { status: "conflict"; productId: string; conflictingProductId: string; gtin: string }
  | { status: "invalid"; gtin: string };

export function normaliseGtin(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidGtin(value: string) {
  const digits = normaliseGtin(value);
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const checkDigit = Number(digits.at(-1));
  const body = digits.slice(0, -1).split("").reverse().map(Number);
  const sum = body.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}

function normaliseIdentity(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-AU")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identitySimilarity(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = normaliseIdentity(left).split(" ").filter((token) => token.length > 1);
  const rightTokens = new Set(normaliseIdentity(right).split(" ").filter(Boolean));
  if (!leftTokens.length || !rightTokens.size) return 0;
  return leftTokens.filter((token) => rightTokens.has(token)).length / leftTokens.length;
}

function valueHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function resolveProductByGtin(gtinValue: string) {
  const gtin = normaliseGtin(gtinValue);
  if (!isValidGtin(gtin)) return null;
  const rows = await prisma.$queryRaw<Array<{
    productId: string;
    gtin: string;
    status: string;
    canonicalName: string | null;
    brand: string | null;
    packSize: string | null;
    confidence: number;
  }>>(Prisma.sql`
    SELECT "productId", "gtin", "status"::text, "canonicalName", "brand", "packSize", "confidence"
    FROM "ProductGtinIdentity"
    WHERE "gtin" = ${gtin}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function claimGtinIdentity(input: GtinIdentityInput): Promise<GtinClaimResult> {
  const gtin = normaliseGtin(input.gtin);
  if (!isValidGtin(gtin)) return { status: "invalid", gtin };

  const existing = await resolveProductByGtin(gtin);
  if (existing && existing.productId !== input.productId) {
    await prisma.$transaction([
      prisma.product.update({ where: { id: input.productId }, data: { lifecycle: "REVIEW_REQUIRED" } }),
      prisma.product.update({ where: { id: existing.productId }, data: { lifecycle: "REVIEW_REQUIRED" } }),
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ProductRepairItem" ("id", "productId", "reason", "status", "priority")
        VALUES (${randomUUID()}, ${input.productId}, ${`GTIN_CONFLICT:${gtin}`}, 'REVIEW_REQUIRED', 1)
        ON CONFLICT DO NOTHING
      `),
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ProductAuditEvent" ("id", "productId", "eventType", "source", "summary", "after")
        VALUES (${randomUUID()}, ${input.productId}, 'GTIN_CONFLICT', ${input.source}, ${`GTIN ${gtin} is already assigned to another product.`}, ${JSON.stringify({ conflictingProductId: existing.productId, gtin })}::jsonb)
      `),
    ]);
    return { status: "conflict", productId: input.productId, conflictingProductId: existing.productId, gtin };
  }

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true, name: true, canonicalName: true, brand: true, packSize: true, barcode: true },
  });
  if (!product) throw new Error("Product not found");

  const proposedName = input.canonicalName ?? product.canonicalName ?? product.name;
  const nameScore = identitySimilarity(product.canonicalName ?? product.name, proposedName);
  const brandScore = product.brand && input.brand ? identitySimilarity(product.brand, input.brand) : 1;
  const packScore = product.packSize && input.packSize ? Number(normaliseIdentity(product.packSize) === normaliseIdentity(input.packSize)) : 1;
  const identityConflict = nameScore < 0.45 || brandScore < 0.5 || packScore === 0;
  const status = identityConflict ? "CONFLICT" : input.verified ? "VERIFIED" : "PROVISIONAL";
  const confidence = Math.max(0, Math.min(1, input.confidence ?? (identityConflict ? 0.35 : 0.9)));

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ProductGtinIdentity" (
        "id", "productId", "gtin", "status", "canonicalName", "brand", "packSize", "source", "sourceUrl", "confidence", "verifiedAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${input.productId}, ${gtin}, ${status}::"GtinIdentityStatus", ${proposedName}, ${input.brand ?? product.brand},
        ${input.packSize ?? product.packSize}, ${input.source}, ${input.sourceUrl ?? null}, ${confidence},
        ${input.verified ? new Date() : null}, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("productId") DO UPDATE SET
        "gtin" = EXCLUDED."gtin", "status" = EXCLUDED."status", "canonicalName" = EXCLUDED."canonicalName",
        "brand" = EXCLUDED."brand", "packSize" = EXCLUDED."packSize", "source" = EXCLUDED."source",
        "sourceUrl" = EXCLUDED."sourceUrl", "confidence" = EXCLUDED."confidence", "verifiedAt" = EXCLUDED."verifiedAt",
        "updatedAt" = CURRENT_TIMESTAMP
    `),
    prisma.product.update({
      where: { id: input.productId },
      data: {
        barcode: gtin,
        lifecycle: identityConflict ? "REVIEW_REQUIRED" : undefined,
        confidenceScore: Math.max(product.barcode === gtin ? confidence : 0, confidence),
      },
    }),
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ProductFieldProvenance" ("id", "productId", "field", "valueHash", "source", "sourceUrl", "confidence", "verifiedAt", "updatedAt")
      VALUES (${randomUUID()}, ${input.productId}, 'gtin', ${valueHash(gtin)}, ${input.source}, ${input.sourceUrl ?? null}, ${confidence}, ${input.verified ? new Date() : null}, CURRENT_TIMESTAMP)
      ON CONFLICT ("productId", "field") DO UPDATE SET
        "valueHash" = EXCLUDED."valueHash", "source" = EXCLUDED."source", "sourceUrl" = EXCLUDED."sourceUrl",
        "confidence" = EXCLUDED."confidence", "verifiedAt" = EXCLUDED."verifiedAt", "updatedAt" = CURRENT_TIMESTAMP
    `),
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ProductAuditEvent" ("id", "productId", "eventType", "source", "summary", "after")
      VALUES (${randomUUID()}, ${input.productId}, ${identityConflict ? "GTIN_IDENTITY_CONFLICT" : "GTIN_CLAIMED"}, ${input.source},
        ${identityConflict ? `GTIN ${gtin} was claimed but identity fields conflict.` : `GTIN ${gtin} was assigned to the canonical product.`},
        ${JSON.stringify({ gtin, proposedName, brand: input.brand, packSize: input.packSize, confidence })}::jsonb)
    `),
  ]);

  return { status: existing ? "updated" : "claimed", productId: input.productId, gtin };
}
