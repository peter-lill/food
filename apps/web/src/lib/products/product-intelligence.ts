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

export type ProductEnrichmentCandidate = {
  name: string;
  brand?: string | null;
  barcode: string;
  imageUrl?: string | null;
  packSize?: string | null;
  category?: string | null;
  description?: string | null;
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  saturatedFatGrams?: number | null;
  fibreGrams?: number | null;
  sugarGrams?: number | null;
  sodiumMg?: number | null;
  source: string;
  confidence: number;
};

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

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
          canonicalName: existing.canonicalName ?? parsed.canonicalName,
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
      update: { productId: product.id, alias: alias.alias, source: input.source },
      create: { productId: product.id, alias: alias.alias, normalised: alias.normalised, source: input.source },
    });
  }

  return { product, parsed };
}

function titleQuality(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return 0;
  const words = text.split(" ").filter(Boolean);
  let score = Math.min(50, words.length * 8) + Math.min(25, text.length / 4);
  if (/\b\d+(?:\.\d+)?\s*(?:mg|g|kg|ml|l|capsules?|tablets?|pack|pk)\b/i.test(text)) score += 20;
  if (/^(unknown|product|food|item)$/i.test(text)) score = 0;
  return score;
}

function shouldReplaceText(
  current: string | null | undefined,
  incoming: string | null | undefined,
  incomingConfidence: number,
  minimumConfidence = 55,
) {
  const next = clean(incoming);
  if (!next || incomingConfidence < minimumConfidence) return false;
  const existing = clean(current);
  if (!existing) return true;
  if (normaliseProductText(existing) === normaliseProductText(next)) return false;
  return titleQuality(next) > titleQuality(existing) + 8;
}

function shouldReplaceNumber(current: number | null | undefined, incoming: number | null | undefined, confidence: number) {
  return (current === null || current === undefined)
    && incoming !== null
    && incoming !== undefined
    && Number.isFinite(incoming)
    && confidence >= 65;
}

export async function enrichProductFromCandidate(candidate: ProductEnrichmentCandidate) {
  const existing = await prisma.product.findUnique({
    where: { barcode: candidate.barcode },
    include: { aliases: true },
  });

  const incomingName = clean(candidate.name)!;
  const preservedCanonicalName = existing?.canonicalName
    ?? (existing && normaliseProductText(existing.name) !== normaliseProductText(incomingName)
      ? parseProductName(existing.name).canonicalName
      : null);
  const update: Record<string, unknown> = {};
  const changedFields: string[] = [];

  if (!existing || shouldReplaceText(existing.name, incomingName, candidate.confidence, 50)) {
    update.name = incomingName;
    changedFields.push("name");
  }
  if (preservedCanonicalName && !existing?.canonicalName) {
    update.canonicalName = preservedCanonicalName;
    changedFields.push("canonicalName");
  }
  if (shouldReplaceText(existing?.brand, candidate.brand, candidate.confidence, 60)) {
    update.brand = clean(candidate.brand);
    changedFields.push("brand");
  }
  if ((!existing?.imageUrl || existing.imageUrl.includes("serpapi")) && clean(candidate.imageUrl) && candidate.confidence >= 65) {
    update.imageUrl = clean(candidate.imageUrl);
    changedFields.push("imageUrl");
  }
  if (shouldReplaceText(existing?.packSize, candidate.packSize, candidate.confidence, 60)) {
    update.packSize = clean(candidate.packSize);
    changedFields.push("packSize");
  }
  if (shouldReplaceText(existing?.category, candidate.category, candidate.confidence, 65)) {
    update.category = clean(candidate.category);
    changedFields.push("category");
  }
  if (shouldReplaceText(existing?.description, candidate.description, candidate.confidence, 75)) {
    update.description = clean(candidate.description);
    changedFields.push("description");
  }

  const nutritionFields = [
    "calories",
    "proteinGrams",
    "carbsGrams",
    "fatGrams",
    "saturatedFatGrams",
    "fibreGrams",
    "sugarGrams",
    "sodiumMg",
  ] as const;
  for (const field of nutritionFields) {
    if (shouldReplaceNumber(existing?.[field], candidate[field], candidate.confidence)) {
      update[field] = candidate[field];
      changedFields.push(field);
    }
  }

  return prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.product.update({
          where: { id: existing.id },
          data: update,
          select: { id: true, name: true, canonicalName: true, brand: true, barcode: true, imageUrl: true, packSize: true },
        })
      : await tx.product.create({
          data: {
            name: incomingName,
            canonicalName: parseProductName(incomingName).canonicalName,
            brand: clean(candidate.brand),
            barcode: candidate.barcode,
            imageUrl: clean(candidate.imageUrl),
            packSize: clean(candidate.packSize),
            category: clean(candidate.category),
            description: clean(candidate.description),
            calories: candidate.calories ?? null,
            proteinGrams: candidate.proteinGrams ?? null,
            carbsGrams: candidate.carbsGrams ?? null,
            fatGrams: candidate.fatGrams ?? null,
            saturatedFatGrams: candidate.saturatedFatGrams ?? null,
            fibreGrams: candidate.fibreGrams ?? null,
            sugarGrams: candidate.sugarGrams ?? null,
            sodiumMg: candidate.sodiumMg ?? null,
          },
          select: { id: true, name: true, canonicalName: true, brand: true, barcode: true, imageUrl: true, packSize: true },
        });

    const aliases = new Set<string>();
    if (existing?.name && normaliseProductText(existing.name) !== normaliseProductText(saved.name)) aliases.add(existing.name);
    if (preservedCanonicalName && normaliseProductText(preservedCanonicalName) !== normaliseProductText(saved.name)) aliases.add(preservedCanonicalName);
    for (const alias of aliases) {
      await tx.productAlias.upsert({
        where: { normalised: normaliseProductText(alias) },
        update: { productId: saved.id, alias, source: candidate.source },
        create: { productId: saved.id, alias, normalised: normaliseProductText(alias), source: candidate.source },
      });
    }

    return { product: saved, changedFields, source: candidate.source, confidence: candidate.confidence };
  });
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
