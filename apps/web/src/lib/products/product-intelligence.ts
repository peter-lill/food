import { prisma } from "@/lib/prisma";
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
  | "price"
  | "receipt"
  | "shopping";

type ResolveProductInput = {
  name: string;
  source: ProductIntelligenceSource;
  brand?: string | null;
  barcode?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  packSize?: string | null;
  packQuantity?: number | null;
  packUnit?: string | null;
};

function uniqueAliases(parsed: ParsedProductName, originalName: string) {
  const values = new Map<string, string>();
  for (const value of [originalName, ...parsed.aliases]) {
    const alias = value.trim();
    const normalised = normaliseProductText(alias);
    if (alias && normalised && !values.has(normalised)) values.set(normalised, alias);
  }
  return [...values.entries()].map(([normalised, alias]) => ({ normalised, alias }));
}

async function findCanonicalProduct(parsed: ParsedProductName, barcode?: string | null) {
  const normalisedAliases = uniqueAliases(parsed, parsed.raw).map((entry) => entry.normalised);
  return prisma.product.findFirst({
    where: {
      OR: [
        ...(barcode ? [{ barcode }] : []),
        { slug: parsed.canonicalKey },
        { canonicalName: { equals: parsed.canonicalName, mode: "insensitive" } },
        { name: { equals: parsed.canonicalName, mode: "insensitive" } },
        { aliases: { some: { normalised: { in: normalisedAliases } } } },
      ],
    },
  });
}

export async function resolveCanonicalProduct(input: ResolveProductInput) {
  const parsed = parseProductName(input.name);
  const existing = await findCanonicalProduct(parsed, input.barcode);

  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data: {
          canonicalName: parsed.canonicalName,
          slug: existing.slug ?? parsed.canonicalKey,
          brand: existing.brand ?? input.brand ?? undefined,
          barcode: existing.barcode ?? input.barcode ?? undefined,
          category: existing.category ?? input.category ?? undefined,
          imageUrl: existing.imageUrl ?? input.imageUrl ?? undefined,
          packSize: existing.packSize ?? input.packSize ?? undefined,
          packQuantity: existing.packQuantity ?? input.packQuantity ?? parsed.packQuantity ?? undefined,
          packUnit: existing.packUnit ?? input.packUnit ?? parsed.packUnit ?? undefined,
        },
      })
    : await prisma.product.create({
        data: {
          name: parsed.canonicalName,
          canonicalName: parsed.canonicalName,
          slug: parsed.canonicalKey,
          brand: input.brand ?? null,
          barcode: input.barcode ?? null,
          category: input.category ?? null,
          imageUrl: input.imageUrl ?? null,
          packSize: input.packSize ?? null,
          packQuantity: input.packQuantity ?? parsed.packQuantity,
          packUnit: input.packUnit ?? parsed.packUnit,
        },
      });

  for (const alias of uniqueAliases(parsed, input.name)) {
    await prisma.productAlias.upsert({
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

  return { product, parsed };
}

export function canonicalProductDisplayName(value: string) {
  return parseProductName(value).canonicalName;
}

export function productIntelligenceMetadata(value: string) {
  const parsed = parseProductName(value);
  return {
    canonicalName: parsed.canonicalName,
    canonicalKey: parsed.canonicalKey,
    preparation: parsed.attributes.preparation,
    variety: parsed.attributes.variety,
    cut: parsed.attributes.cut,
    skin: parsed.attributes.skin,
    state: parsed.attributes.state,
    component: parsed.attributes.component,
    variants: parsed.variants,
  };
}
