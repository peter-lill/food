"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function normaliseAlias(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function mergeProduct(sourceProductId: string, formData: FormData) {
  const targetProductId = String(formData.get("targetProductId") ?? "").trim();
  const confirmed = formData.get("confirmMerge") === "yes";

  if (!targetProductId || targetProductId === sourceProductId) {
    throw new Error("Choose a different product to keep.");
  }
  if (!confirmed) throw new Error("Confirm that you understand the duplicate product will be removed.");

  const result = await prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.product.findUnique({ where: { id: sourceProductId }, include: { aliases: true } }),
      tx.product.findUnique({ where: { id: targetProductId }, include: { aliases: true } }),
    ]);

    if (!source || !target) throw new Error("One of the selected products no longer exists.");
    if (source.barcode && target.barcode && source.barcode !== target.barcode) {
      throw new Error("These products have different known barcodes and cannot be merged safely.");
    }

    const targetAliasKeys = new Set(target.aliases.map((alias) => alias.normalised));
    const aliasCandidates = [
      { alias: source.name, source: "product-merge" },
      source.canonicalName ? { alias: source.canonicalName, source: "product-merge" } : null,
      ...source.aliases.map((alias) => ({ alias: alias.alias, source: alias.source ?? "product-merge" })),
    ].filter((entry): entry is { alias: string; source: string } => Boolean(entry));

    for (const candidate of aliasCandidates) {
      const normalised = normaliseAlias(candidate.alias);
      if (!normalised || targetAliasKeys.has(normalised)) continue;
      const existing = await tx.productAlias.findUnique({ where: { normalised }, select: { id: true } });
      if (!existing) {
        await tx.productAlias.create({
          data: { productId: target.id, alias: candidate.alias, normalised, source: candidate.source },
        });
        targetAliasKeys.add(normalised);
      }
    }

    await tx.product.update({
      where: { id: target.id },
      data: {
        barcode: target.barcode ?? source.barcode,
        brand: target.brand ?? source.brand,
        category: target.category ?? source.category,
        description: target.description ?? source.description,
        imageUrl: target.imageUrl ?? source.imageUrl,
        packSize: target.packSize ?? source.packSize,
        packQuantity: target.packQuantity ?? source.packQuantity,
        packUnit: target.packUnit ?? source.packUnit,
        calories: target.calories ?? source.calories,
        proteinGrams: target.proteinGrams ?? source.proteinGrams,
        carbsGrams: target.carbsGrams ?? source.carbsGrams,
        fatGrams: target.fatGrams ?? source.fatGrams,
        saturatedFatGrams: target.saturatedFatGrams ?? source.saturatedFatGrams,
        fibreGrams: target.fibreGrams ?? source.fibreGrams,
        sugarGrams: target.sugarGrams ?? source.sugarGrams,
        sodiumMg: target.sodiumMg ?? source.sodiumMg,
        allergens: target.allergens.length ? target.allergens : source.allergens,
        dietaryTags: target.dietaryTags.length ? target.dietaryTags : source.dietaryTags,
        foodKnowledgeId: target.foodKnowledgeId ?? source.foodKnowledgeId,
        confidenceScore: Math.max(target.confidenceScore, source.confidenceScore),
        lifecycle: "REVIEW_REQUIRED",
      },
    });

    await Promise.all([
      tx.inventoryItem.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
      tx.ingredient.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
      tx.shoppingItem.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
      tx.receiptItem.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
      tx.supermarketPrice.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
      tx.storeProduct.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
      tx.priceObservation.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
    ]);

    await tx.product.delete({ where: { id: source.id } });
    return { id: target.id, slug: target.slug };
  });

  revalidatePath("/products");
  revalidatePath("/pantry");
  revalidatePath("/shopping");
  redirect(`/products/${result.slug ?? result.id}`);
}
