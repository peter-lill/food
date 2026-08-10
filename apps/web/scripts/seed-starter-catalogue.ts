import "dotenv/config";

import { ProductLifecycle, ProductType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { normaliseProductText } from "../src/lib/products/product-normalisation";

const apply = process.argv.includes("--apply");

export const starterProducts: Array<{ name: string; category: string; productType: ProductType }> = [
  ...["Bananas", "Apples", "Oranges", "Lemons", "Limes", "Avocados", "Tomatoes", "Brown Onions", "Garlic", "Carrots", "Potatoes", "Sweet Potatoes", "Broccoli", "Capsicum", "Zucchini", "Mushrooms", "Cucumber", "Spinach", "Rocket Leaves"].map((name) => ({ name, category: "Fruit & vegetables", productType: ProductType.GENERIC_PRODUCE })),
  ...["Full-cream Milk", "Light Milk", "Plain Greek Yoghurt", "Cheddar Cheese", "Parmesan", "Cream Cheese", "Sour Cream", "Eggs", "Butter"].map((name) => ({ name, category: "Dairy & eggs", productType: ProductType.DAIRY })),
  ...["White Bread", "Wholemeal Bread", "Wraps", "Rolled Oats", "White Rice", "Brown Rice", "Pasta", "Plain Flour"].map((name) => ({ name, category: "Bakery", productType: ProductType.BAKERY })),
  ...["Olive Oil", "Vegetable Oil", "Sugar", "Salt", "Black Pepper", "Baking Powder", "Canned Diced Tomatoes", "Tomato Paste", "Canned Chickpeas", "Canned Black Beans", "Chicken Stock", "Vegetable Stock"].map((name) => ({ name, category: "Pantry", productType: ProductType.OTHER })),
  ...["Toilet Paper", "Dishwashing Liquid"].map((name) => ({ name, category: "Household", productType: ProductType.HOUSEHOLD })),
];

async function existingProductId(name: string) {
  const normalised = normaliseProductText(name);
  const alias = await prisma.productAlias.findUnique({ where: { normalised }, select: { productId: true } });
  if (alias) return alias.productId;
  const product = await prisma.product.findFirst({
    where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { canonicalName: { equals: name, mode: "insensitive" } }] },
    select: { id: true },
  });
  return product?.id ?? null;
}

async function main() {
  console.log(`${apply ? "Importing" : "Would import"} ${starterProducts.length} starter products.`);
  let created = 0;
  let retained = 0;
  for (const starter of starterProducts) {
    const existingId = await existingProductId(starter.name);
    if (existingId) { retained += 1; console.log(`Keep: ${starter.name}`); continue; }
    created += 1;
    console.log(`${apply ? "Create" : "Would create"}: ${starter.name} (${starter.category})`);
    if (!apply) continue;
    const product = await prisma.product.create({
      data: {
        name: starter.name, canonicalName: starter.name, category: starter.category, productType: starter.productType,
        lifecycle: starter.productType === ProductType.GENERIC_PRODUCE ? ProductLifecycle.MATCHED : ProductLifecycle.REVIEW_REQUIRED,
        confidenceScore: starter.productType === ProductType.GENERIC_PRODUCE ? 0.95 : 0.45,
      },
      select: { id: true },
    });
    await prisma.productAlias.create({ data: { productId: product.id, alias: starter.name, normalised: normaliseProductText(starter.name), source: "starter-catalogue" } });
  }
  console.log(`${apply ? "Completed" : "Previewed"}: ${created} new, ${retained} already present.`);
  console.log("Packaged products remain unpriced until a retailer-authoritative listing with a pack size is selected.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
