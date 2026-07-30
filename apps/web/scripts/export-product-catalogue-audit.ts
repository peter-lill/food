import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

async function main() {
  const products = await prisma.product.findMany({
    include: {
      foodKnowledge: true,
      aliases: { orderBy: { alias: "asc" } },
      ingredientRecords: {
        include: {
          recipes: {
            include: {
              recipe: { select: { id: true, name: true, sourceName: true } },
            },
          },
        },
      },
      inventoryItems: {
        select: {
          id: true,
          quantity: true,
          unit: true,
          location: true,
          expiresAt: true,
          purchasedAt: true,
        },
      },
      shoppingItems: {
        select: {
          id: true,
          name: true,
          quantity: true,
          unit: true,
          checked: true,
        },
      },
      receiptItems: {
        select: {
          id: true,
          rawDescription: true,
          normalisedName: true,
          quantity: true,
          unit: true,
        },
      },
      storeProducts: {
        select: {
          id: true,
          retailer: true,
          externalId: true,
          retailerProductName: true,
          brand: true,
          packSize: true,
          productUrl: true,
          active: true,
        },
      },
      priceObservations: {
        orderBy: { observedAt: "desc" },
        take: 5,
        select: {
          retailer: true,
          price: true,
          isSpecial: true,
          observedAt: true,
          source: true,
        },
      },
    },
    orderBy: [{ lifecycle: "asc" }, { canonicalName: "asc" }, { name: "asc" }],
  });

  const rows = products.map((product) => ({
    id: product.id,
    lifecycle: product.lifecycle,
    name: product.name,
    canonicalName: product.canonicalName,
    brand: product.brand,
    barcode: product.barcode,
    category: product.category,
    productType: product.productType,
    packSize: product.packSize,
    packQuantity: product.packQuantity,
    packUnit: product.packUnit,
    confidenceScore: product.confidenceScore,
    foodKnowledge: product.foodKnowledge
      ? {
          id: product.foodKnowledge.id,
          commonName: product.foodKnowledge.commonName,
          category: product.foodKnowledge.category,
          subCategory: product.foodKnowledge.subCategory,
          foodGroup: product.foodKnowledge.foodGroup,
        }
      : null,
    aliases: product.aliases.map((alias) => ({
      alias: alias.alias,
      normalised: alias.normalised,
      source: alias.source,
    })),
    ingredientNames: unique(product.ingredientRecords.map((ingredient) => ingredient.name)),
    recipes: product.ingredientRecords.flatMap((ingredient) =>
      ingredient.recipes.map((link) => ({
        ingredient: ingredient.name,
        recipeId: link.recipe.id,
        recipeName: link.recipe.name,
        sourceName: link.recipe.sourceName,
      })),
    inventory: product.inventoryItems,
    shoppingNames: unique(product.shoppingItems.map((item) => item.name)),
    shoppingItems: product.shoppingItems,
    receiptNames: unique(product.receiptItems.flatMap((item) => [item.normalisedName, item.rawDescription])),
    receiptItems: product.receiptItems,
    retailerListings: product.storeProducts,
    recentPrices: product.priceObservations,
    evidenceSummary: unique([
      product.name,
      product.canonicalName,
      product.foodKnowledge?.commonName,
      ...product.aliases.map((alias) => alias.alias),
      ...product.ingredientRecords.map((ingredient) => ingredient.name),
      ...product.shoppingItems.map((item) => item.name),
      ...product.receiptItems.flatMap((item) => [item.normalisedName, item.rawDescription]),
      ...product.storeProducts.map((listing) => listing.retailerProductName),
    ]),
  }));

  const outputDirectory = path.resolve(process.cwd(), "artifacts");
  const outputPath = path.join(outputDirectory, "product-catalogue-audit.json");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalProducts: rows.length,
        activeProducts: rows.filter((row) => row.lifecycle !== "ARCHIVED").length,
        archivedProducts: rows.filter((row) => row.lifecycle === "ARCHIVED").length,
        products: rows,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Exported ${rows.length} product records to ${outputPath}`);
  console.log("Upload product-catalogue-audit.json to ChatGPT for a complete record-by-record cleanup review.");
}

main()
  .catch((error) => {
    console.error("Unable to export product catalogue audit", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
