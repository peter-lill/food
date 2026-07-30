import { prisma } from "../src/lib/prisma";
import { foodItemIdentity, isPlausibleGroceryName } from "../src/lib/products/food-item-intelligence";
import { formatProductName } from "../src/lib/products/product-formatter";
import { normaliseProductText } from "../src/lib/products/product-normalisation";

const apply = process.argv.includes("--apply");

function safeDerived(product: { barcode: string | null; storeProducts: { id: string }[] }) {
  return !product.barcode && product.storeProducts.length === 0;
}

async function foodKnowledgeFor(name: string) {
  return prisma.foodKnowledge.findFirst({
    where: { commonName: { equals: name, mode: "insensitive" } },
  }) ?? prisma.foodKnowledge.create({ data: { commonName: name } });
}

async function relinkAndArchive(sourceId: string, targetId: string, sourceName: string) {
  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.ingredient.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.shoppingItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.receiptItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.supermarketPrice.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.priceObservation.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.productEnrichmentJob.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });

    const normalised = normaliseProductText(sourceName);
    if (normalised && isPlausibleGroceryName(sourceName)) {
      await tx.productAlias.upsert({
        where: { normalised },
        update: { productId: targetId, alias: sourceName, source: "bulk-cleanup" },
        create: { productId: targetId, alias: sourceName, normalised, source: "bulk-cleanup" },
      });
    }

    await tx.product.update({
      where: { id: sourceId },
      data: { lifecycle: "ARCHIVED", confidenceScore: 0 },
    });
  });
}

async function main() {
  const products = await prisma.product.findMany({
    include: { storeProducts: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });

  const summary = { scanned: products.length, invalid: 0, updated: 0, merged: 0, unchanged: 0, failed: 0 };
  console.log(`${apply ? "Applying" : "Previewing"} Product Intelligence cleanup for ${products.length} product(s).`);

  for (const product of products) {
    const sourceName = product.canonicalName?.trim() || product.name.trim();

    try {
      if (!isPlausibleGroceryName(sourceName)) {
        console.log(`INVALID  ${product.name}`);
        summary.invalid += 1;
        if (apply) {
          await prisma.product.update({
            where: { id: product.id },
            data: { lifecycle: "ARCHIVED", confidenceScore: 0 },
          });
        }
        continue;
      }

      const identity = foodItemIdentity(sourceName);
      if (!identity) {
        summary.unchanged += 1;
        continue;
      }

      const canonicalName = formatProductName(identity);
      const changed = normaliseProductText(sourceName) !== identity;
      const target = await prisma.product.findFirst({
        where: {
          id: { not: product.id },
          lifecycle: { not: "ARCHIVED" },
          OR: [
            { canonicalName: { equals: canonicalName, mode: "insensitive" } },
            { name: { equals: canonicalName, mode: "insensitive" } },
          ],
        },
        include: { storeProducts: { select: { id: true } } },
        orderBy: [{ barcode: "desc" }, { updatedAt: "desc" }],
      });

      if (target && changed && safeDerived(product)) {
        console.log(`MERGE    ${product.name} -> ${canonicalName}`);
        summary.merged += 1;
        if (apply) await relinkAndArchive(product.id, target.id, product.name);
        continue;
      }

      const knowledge = apply ? await foodKnowledgeFor(canonicalName) : null;
      const needsUpdate = product.canonicalName !== canonicalName
        || Boolean(knowledge && product.foodKnowledgeId !== knowledge.id)
        || Boolean(changed && safeDerived(product) && product.name !== canonicalName);

      if (!needsUpdate) {
        summary.unchanged += 1;
        continue;
      }

      console.log(`UPDATE   ${product.name} -> ${canonicalName}`);
      summary.updated += 1;
      if (apply) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            name: changed && safeDerived(product) ? canonicalName : product.name,
            canonicalName,
            foodKnowledgeId: knowledge?.id,
          },
        });
      }
    } catch (error) {
      summary.failed += 1;
      console.error(`FAILED   ${product.id} ${product.name}`, error);
    }
  }

  console.table(summary);
  if (!apply) console.log("Preview only. Re-run with --apply to perform this cleanup automatically.");
}

main()
  .catch((error) => {
    console.error("Product Intelligence cleanup failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
