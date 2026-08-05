import type { Prisma, Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { backgroundJobTypes, enqueueBackgroundJob } from "@/lib/jobs/background-jobs";
import { productDepartment } from "./product-category";
import {
  normaliseProductText,
  parseProductName,
  type ParsedProductName,
} from "./product-normalisation";

export type ProductIntelligenceSource =
  | "barcode"
  | "ingredient"
  | "manual"
  | "pantry"
  | "receipt"
  | "recipe"
  | "shopping";

export type ResolveCanonicalProductInput = {
  rawName: string;
  source: ProductIntelligenceSource;
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  packSize?: string | null;
  packQuantity?: number | null;
  packUnit?: string | null;
};

export type CanonicalProductResolution = {
  product: Product;
  parsed: ParsedProductName;
  created: boolean;
};

function cleanOptional(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function aliasesFor(parsed: ParsedProductName, rawName: string) {
  const aliases = new Map<string, string>();
  for (const value of [rawName, ...parsed.aliases, parsed.canonicalName]) {
    const alias = value.replace(/\s+/g, " ").trim();
    const normalised = normaliseProductText(alias);
    if (alias && normalised && !aliases.has(normalised)) aliases.set(normalised, alias);
  }
  return [...aliases.entries()].map(([normalised, alias]) => ({ normalised, alias }));
}

async function findCanonicalProduct(
  tx: Prisma.TransactionClient,
  parsed: ParsedProductName,
  barcode: string | null,
) {
  if (barcode) {
    const barcodeMatch = await tx.product.findUnique({ where: { barcode } });
    if (barcodeMatch) return barcodeMatch;
  }

  const aliases = aliasesFor(parsed, parsed.raw).map((alias) => alias.normalised);
  return tx.product.findFirst({
    where: {
      OR: [
        { slug: parsed.canonicalKey },
        { canonicalName: { equals: parsed.canonicalName, mode: "insensitive" } },
        { name: { equals: parsed.canonicalName, mode: "insensitive" } },
        { aliases: { some: { normalised: { in: aliases } } } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function resolveCanonicalProduct(
  input: ResolveCanonicalProductInput,
): Promise<CanonicalProductResolution> {
  const parsed = parseProductName(input.rawName);
  const barcode = cleanOptional(input.barcode);
  const brand = cleanOptional(input.brand);
  const category = productDepartment(cleanOptional(input.category), parsed.canonicalName);
  const imageUrl = cleanOptional(input.imageUrl);
  const packSize = cleanOptional(input.packSize);
  const packUnit = cleanOptional(input.packUnit) ?? parsed.packUnit;
  const packQuantity = input.packQuantity ?? parsed.packQuantity;

  const resolution = await prisma.$transaction(async (tx) => {
    const existing = await findCanonicalProduct(tx, parsed, barcode);
    const created = !existing;

    const product = existing
      ? await tx.product.update({
          where: { id: existing.id },
          data: {
            canonicalName: parsed.canonicalName,
            name: parsed.canonicalName,
            slug: existing.slug ?? parsed.canonicalKey,
            barcode: existing.barcode ?? barcode,
            brand: existing.brand ?? brand,
            category: productDepartment(existing.category ?? category, parsed.canonicalName),
            imageUrl: existing.imageUrl ?? imageUrl,
            packSize: existing.packSize ?? packSize,
            packQuantity: existing.packQuantity ?? packQuantity,
            packUnit: existing.packUnit ?? packUnit,
          },
        })
      : await tx.product.create({
          data: {
            name: parsed.canonicalName,
            canonicalName: parsed.canonicalName,
            slug: parsed.canonicalKey,
            barcode,
            brand,
            category,
            imageUrl,
            packSize,
            packQuantity,
            packUnit,
          },
        });

    for (const alias of aliasesFor(parsed, input.rawName)) {
      await tx.productAlias.upsert({
        where: { normalised: alias.normalised },
        update: {
          productId: product.id,
          alias: alias.alias,
          source: input.source,
        },
        create: {
          productId: product.id,
          alias: alias.alias,
          normalised: alias.normalised,
          source: input.source,
        },
      });
    }

    return { product, parsed, created };
  });

  await enqueueBackgroundJob(
    backgroundJobTypes.productRetailerEnrichment,
    { productId: resolution.product.id, provider: "coles-woolworths" },
    {
      priority: 120,
      deduplicationKey: `product-retailer-enrichment-${resolution.product.id}`,
    },
  );

  return resolution;
}
