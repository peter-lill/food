import { prisma } from "../src/lib/prisma";
import { normaliseProductText, parseProductName } from "../src/lib/products/product-normalisation";

const apply = process.argv.includes("--apply");

function loadProducts() {
  return prisma.product.findMany({
    include: {
      aliases: true,
      _count: {
        select: {
          inventoryItems: true,
          ingredientRecords: true,
          shoppingItems: true,
          receiptItems: true,
          supermarketPrices: true,
          storeProducts: true,
          priceObservations: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

type ProductRecord = Awaited<ReturnType<typeof loadProducts>>[number];

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function completeness(product: ProductRecord) {
  const populated = [
    product.barcode,
    product.brand,
    product.category,
    product.description,
    product.imageUrl,
    product.packSize,
    product.calories,
  ].filter(hasValue).length;
  const links = Object.values(product._count).reduce((sum, value) => sum + value, 0);
  return populated * 100 + links * 4 + product.aliases.length;
}

function chooseSurvivor(products: ProductRecord[]) {
  return [...products].sort((left, right) => {
    const difference = completeness(right) - completeness(left);
    return difference || left.createdAt.getTime() - right.createdAt.getTime();
  })[0];
}

function firstString(products: ProductRecord[], selector: (product: ProductRecord) => string | null) {
  return products.map(selector).find((value): value is string => Boolean(value?.trim())) ?? null;
}

function firstNumber(products: ProductRecord[], selector: (product: ProductRecord) => number | null) {
  return products.map(selector).find((value): value is number => value !== null && Number.isFinite(value)) ?? null;
}

function uniqueAliases(products: ProductRecord[], canonicalName: string) {
  const aliases = new Map<string, string>();
  for (const value of [
    canonicalName,
    ...products.flatMap((product) => [
      product.name,
      product.canonicalName ?? "",
      ...product.aliases.map((alias) => alias.alias),
    ]),
  ]) {
    const alias = value.trim();
    const normalised = normaliseProductText(alias);
    if (alias && normalised && !aliases.has(normalised)) aliases.set(normalised, alias);
  }
  return [...aliases.entries()].map(([normalised, alias]) => ({ normalised, alias }));
}

async function mergeGroup(key: string, products: ProductRecord[]) {
  const parsed = parseProductName(products[0].canonicalName ?? products[0].name);
  const survivor = chooseSurvivor(products);
  const duplicates = products.filter((product) => product.id !== survivor.id);
  const duplicateIds = duplicates.map((product) => product.id);
  const aliases = uniqueAliases(products, parsed.canonicalName);
  const best = [...products].sort((left, right) => completeness(right) - completeness(left));

  console.log(`\n${parsed.canonicalName} [${key}]`);
  console.log(`  keep: ${survivor.name} (${survivor.id})`);
  for (const duplicate of duplicates) console.log(`  merge: ${duplicate.name} (${duplicate.id})`);

  if (!apply || duplicateIds.length === 0) return;

  const preservedBarcode = survivor.barcode ?? firstString(best, (product) => product.barcode);

  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({
      where: { id: { in: duplicateIds } },
      data: { slug: null, barcode: null },
    });

    await Promise.all([
      tx.inventoryItem.updateMany({ where: { productId: { in: duplicateIds } }, data: { productId: survivor.id } }),
      tx.ingredient.updateMany({ where: { productId: { in: duplicateIds } }, data: { productId: survivor.id } }),
      tx.shoppingItem.updateMany({ where: { productId: { in: duplicateIds } }, data: { productId: survivor.id } }),
      tx.receiptItem.updateMany({ where: { productId: { in: duplicateIds } }, data: { productId: survivor.id } }),
      tx.supermarketPrice.updateMany({ where: { productId: { in: duplicateIds } }, data: { productId: survivor.id } }),
      tx.storeProduct.updateMany({ where: { productId: { in: duplicateIds } }, data: { productId: survivor.id } }),
      tx.priceObservation.updateMany({ where: { productId: { in: duplicateIds } }, data: { productId: survivor.id } }),
    ]);

    for (const alias of aliases) {
      await tx.productAlias.upsert({
        where: { normalised: alias.normalised },
        update: { productId: survivor.id, alias: alias.alias },
        create: {
          productId: survivor.id,
          alias: alias.alias,
          normalised: alias.normalised,
          source: "catalogue-reconciliation",
        },
      });
    }

    await tx.productAlias.deleteMany({ where: { productId: { in: duplicateIds } } });

    await tx.product.update({
      where: { id: survivor.id },
      data: {
        name: parsed.canonicalName,
        canonicalName: parsed.canonicalName,
        slug: parsed.canonicalKey,
        brand: survivor.brand ?? firstString(best, (product) => product.brand),
        barcode: preservedBarcode,
        category: survivor.category ?? firstString(best, (product) => product.category),
        description: survivor.description ?? firstString(best, (product) => product.description),
        imageUrl: survivor.imageUrl ?? firstString(best, (product) => product.imageUrl),
        packSize: survivor.packSize ?? firstString(best, (product) => product.packSize),
        packQuantity: survivor.packQuantity ?? firstNumber(best, (product) => product.packQuantity),
        packUnit: survivor.packUnit ?? firstString(best, (product) => product.packUnit),
      },
    });

    await tx.product.deleteMany({ where: { id: { in: duplicateIds } } });
  });
}

async function normaliseSingle(product: ProductRecord) {
  const parsed = parseProductName(product.canonicalName ?? product.name);
  if (!apply) return;

  await prisma.product.update({
    where: { id: product.id },
    data: {
      name: parsed.canonicalName,
      canonicalName: parsed.canonicalName,
      slug: product.slug ?? parsed.canonicalKey,
    },
  });

  for (const alias of uniqueAliases([product], parsed.canonicalName)) {
    await prisma.productAlias.upsert({
      where: { normalised: alias.normalised },
      update: { productId: product.id, alias: alias.alias },
      create: {
        productId: product.id,
        alias: alias.alias,
        normalised: alias.normalised,
        source: "catalogue-reconciliation",
      },
    });
  }
}

async function main() {
  const products = await loadProducts();
  const groups = new Map<string, ProductRecord[]>();

  for (const product of products) {
    const parsed = parseProductName(product.canonicalName ?? product.name);
    const group = groups.get(parsed.canonicalKey) ?? [];
    group.push(product);
    groups.set(parsed.canonicalKey, group);
  }

  const duplicates = [...groups.entries()].filter(([, group]) => group.length > 1);
  console.log(apply ? "Applying Product Intelligence reconciliation..." : "Product Intelligence reconciliation dry run...");
  console.log(`Products: ${products.length}`);
  console.log(`Canonical identities: ${groups.size}`);
  console.log(`Duplicate groups: ${duplicates.length}`);

  for (const [key, group] of duplicates) await mergeGroup(key, group);
  for (const [, group] of groups) {
    if (group.length === 1) await normaliseSingle(group[0]);
  }

  if (!apply) {
    console.log("\nNo database changes were made.");
    console.log("Run npm run products:reconcile:apply after reviewing the duplicate groups.");
  } else {
    console.log("\nProduct catalogue reconciliation complete.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
