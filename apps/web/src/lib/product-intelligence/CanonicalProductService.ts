import { ProductLifecycle, ProductType, type Prisma, type Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseProductName } from "@/lib/products/product-normalisation";
import { normaliseProductIdentity } from "./ProductResolver";

type ProductDatabase = Prisma.TransactionClient | typeof prisma;

const genericProduceNames = new Set([
  "Apple", "Avocado", "Banana", "Bean", "Beetroot", "Broccoli", "Button Mushroom",
  "Cabbage", "Capsicum", "Carrot", "Cauliflower", "Celery", "Cucumber", "Garlic",
  "Ginger", "Grape", "Lemon", "Lettuce", "Lime", "Mango", "Onion", "Orange",
  "Pear", "Potato", "Pumpkin", "Spinach", "Sweet Potato", "Tomato", "Watermelon", "Zucchini",
]);

function isGenericProduce(canonicalName: string) {
  return genericProduceNames.has(canonicalName);
}

function canonicalImage(canonicalName: string) {
  return canonicalName === "Button Mushroom" ? "/product-images/button-mushroom.svg" : null;
}

async function attachAlias(
  database: ProductDatabase,
  productId: string,
  alias: string | null | undefined,
  source: string,
) {
  const cleanAlias = alias?.replace(/\s+/g, " ").trim();
  if (!cleanAlias) return;
  const normalised = normaliseProductIdentity(cleanAlias);
  if (!normalised) return;

  await database.productAlias.upsert({
    where: { normalised },
    create: { productId, alias: cleanAlias, normalised, source },
    update: { productId, alias: cleanAlias, source },
  });
}

function preferredTarget(products: Product[], canonicalName: string) {
  return [...products].sort((left, right) => {
    const leftExact = left.name.toLocaleLowerCase("en-AU") === canonicalName.toLocaleLowerCase("en-AU") ? 1 : 0;
    const rightExact = right.name.toLocaleLowerCase("en-AU") === canonicalName.toLocaleLowerCase("en-AU") ? 1 : 0;
    if (leftExact !== rightExact) return rightExact - leftExact;
    const leftGeneric = left.productType === ProductType.GENERIC_PRODUCE ? 1 : 0;
    const rightGeneric = right.productType === ProductType.GENERIC_PRODUCE ? 1 : 0;
    if (leftGeneric !== rightGeneric) return rightGeneric - leftGeneric;
    return left.createdAt.getTime() - right.createdAt.getTime();
  })[0];
}

export class CanonicalProductService {
  static identity(value: string) {
    return parseProductName(value);
  }

  static async merge(targetId: string, sourceId: string, database: ProductDatabase = prisma) {
    if (targetId === sourceId) return targetId;

    const run = async (transaction: ProductDatabase) => {
      const [target, source] = await Promise.all([
        transaction.product.findUnique({ where: { id: targetId }, include: { aliases: true } }),
        transaction.product.findUnique({ where: { id: sourceId }, include: { aliases: true } }),
      ]);
      if (!target || !source) throw new Error("Both canonical and duplicate products are required for a merge.");

      const canonicalName = parseProductName(target.canonicalName ?? target.name).canonicalName;
      const sourceBarcode = !target.barcode ? source.barcode : null;
      const sourceSlug = !target.slug ? source.slug : null;

      if (sourceBarcode || sourceSlug) {
        await transaction.product.update({
          where: { id: source.id },
          data: {
            ...(sourceBarcode ? { barcode: null } : {}),
            ...(sourceSlug ? { slug: null } : {}),
          },
        });
      }

      await Promise.all([
        transaction.inventoryItem.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
        transaction.ingredient.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
        transaction.shoppingItem.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
        transaction.receiptItem.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
        transaction.supermarketPrice.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
        transaction.storeProduct.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
        transaction.priceObservation.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
        transaction.productEnrichmentJob.updateMany({ where: { productId: source.id }, data: { productId: target.id } }),
      ]);

      await attachAlias(transaction, target.id, source.name, "canonical-merge");
      await attachAlias(transaction, target.id, source.canonicalName, "canonical-merge");
      for (const alias of source.aliases) {
        await attachAlias(transaction, target.id, alias.alias, alias.source ?? "canonical-merge");
      }

      await transaction.productAlias.deleteMany({ where: { productId: source.id } });
      await transaction.product.delete({ where: { id: source.id } });

      await transaction.product.update({
        where: { id: target.id },
        data: {
          name: canonicalName,
          canonicalName,
          productType: isGenericProduce(canonicalName) ? ProductType.GENERIC_PRODUCE : target.productType,
          lifecycle: ProductLifecycle.MATCHED,
          confidenceScore: Math.max(target.confidenceScore, source.confidenceScore, 0.95),
          imageUrl: canonicalImage(canonicalName) ?? target.imageUrl ?? source.imageUrl,
          barcode: target.barcode ?? sourceBarcode,
          slug: target.slug ?? sourceSlug,
          brand: target.brand ?? source.brand,
          category: target.category ?? source.category ?? (isGenericProduce(canonicalName) ? "Fresh produce" : null),
          description: target.description ?? source.description,
          foodKnowledgeId: target.foodKnowledgeId ?? source.foodKnowledgeId,
        },
      });

      await attachAlias(transaction, target.id, canonicalName, "canonical-name");
      return target.id;
    };

    return database === prisma
      ? prisma.$transaction((transaction) => run(transaction))
      : run(database);
  }

  static async consolidateGenericProduce() {
    const products = await prisma.product.findMany({ orderBy: { createdAt: "asc" } });
    const groups = new Map<string, Product[]>();

    for (const product of products) {
      const rawIdentity = parseProductName(product.name);
      const canonicalIdentity = parseProductName(product.canonicalName ?? product.name);
      const canonicalName = isGenericProduce(rawIdentity.canonicalName)
        ? rawIdentity.canonicalName
        : canonicalIdentity.canonicalName;
      if (!isGenericProduce(canonicalName)) continue;
      const key = normaliseProductIdentity(canonicalName);
      groups.set(key, [...(groups.get(key) ?? []), product]);
    }

    let merged = 0;
    const consolidated: Array<{ canonicalName: string; productId: string; merged: number }> = [];

    for (const group of groups.values()) {
      const canonicalName = parseProductName(group[0].name).canonicalName;
      let target = preferredTarget(group, canonicalName);
      let groupMerged = 0;

      for (const source of group) {
        if (source.id === target.id) continue;
        await this.merge(target.id, source.id);
        groupMerged += 1;
        merged += 1;
      }

      await prisma.product.update({
        where: { id: target.id },
        data: {
          name: canonicalName,
          canonicalName,
          productType: ProductType.GENERIC_PRODUCE,
          lifecycle: ProductLifecycle.MATCHED,
          confidenceScore: { set: Math.max(target.confidenceScore, 0.95) },
          category: target.category ?? "Fresh produce",
          imageUrl: canonicalImage(canonicalName) ?? target.imageUrl,
        },
      });
      await attachAlias(prisma, target.id, canonicalName, "canonical-name");
      consolidated.push({ canonicalName, productId: target.id, merged: groupMerged });
    }

    return { merged, groups: consolidated };
  }
}
