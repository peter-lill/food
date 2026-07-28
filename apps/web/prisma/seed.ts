import "dotenv/config";
import { InventoryLocation, ProductType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const dayInMilliseconds = 24 * 60 * 60 * 1000;

function daysFromToday(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setTime(date.getTime() + days * dayInMilliseconds);
  return date;
}

const foodKnowledgeSeeds = [
  {
    commonName: "Banana",
    foodGroup: "Fruit",
    category: "Fresh produce",
    storageGuide: "Store at room temperature until ripe. Refrigerate ripe bananas to slow further ripening.",
  },
  {
    commonName: "Sweet Potato",
    scientificName: "Ipomoea batatas",
    foodGroup: "Vegetables",
    category: "Fresh produce",
    subCategory: "Root vegetables",
    storageGuide: "Keep in a cool, dark and ventilated place. Do not refrigerate raw sweet potatoes.",
  },
  {
    commonName: "Atlantic Salmon",
    scientificName: "Salmo salar",
    foodGroup: "Protein foods",
    category: "Seafood",
    storageGuide: "Keep chilled and use by the package date, or freeze promptly.",
  },
  {
    commonName: "Chicken Breast",
    foodGroup: "Protein foods",
    category: "Fresh meat",
    storageGuide: "Keep refrigerated below 5°C and use by the package date, or freeze promptly.",
  },
  {
    commonName: "Milk",
    foodGroup: "Dairy",
    category: "Chilled",
    storageGuide: "Keep refrigerated and return to the refrigerator promptly after use.",
  },
] as const;

const pantrySeedItems = [
  {
    name: "Chicken breast",
    quantity: 2.4,
    unit: "kg",
    location: InventoryLocation.FRIDGE,
    purchasedAt: daysFromToday(-1),
    expiresAt: daysFromToday(3),
    productType: ProductType.FRESH_MEAT,
  },
  {
    name: "Greek yoghurt",
    quantity: 1,
    unit: "tub",
    location: InventoryLocation.FRIDGE,
    purchasedAt: daysFromToday(-3),
    expiresAt: daysFromToday(1),
    productType: ProductType.DAIRY,
  },
  {
    name: "Salmon",
    quantity: 3,
    unit: "fillets",
    location: InventoryLocation.FREEZER,
    purchasedAt: daysFromToday(-5),
    expiresAt: daysFromToday(30),
    productType: ProductType.SEAFOOD,
  },
  {
    name: "Brown rice",
    quantity: 1.6,
    unit: "kg",
    location: InventoryLocation.PANTRY,
    purchasedAt: daysFromToday(-10),
    expiresAt: daysFromToday(180),
    productType: ProductType.PACKAGED,
  },
] as const;

async function seedFoodKnowledge() {
  for (const knowledge of foodKnowledgeSeeds) {
    await prisma.foodKnowledge.upsert({
      where: { commonName: knowledge.commonName },
      create: knowledge,
      update: knowledge,
    });
  }
  console.log(`Food knowledge seeded with ${foodKnowledgeSeeds.length} entries.`);
}

async function seedPantry() {
  const existingItems = await prisma.inventoryItem.count();
  if (existingItems > 0) {
    console.log(`Pantry seed skipped: ${existingItems} existing item(s) found.`);
    return;
  }

  for (const item of pantrySeedItems) {
    const product = await prisma.product.create({
      data: {
        name: item.name,
        canonicalName: item.name,
        productType: item.productType,
      },
    });

    await prisma.inventoryItem.create({
      data: {
        productId: product.id,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location,
        purchasedAt: item.purchasedAt,
        expiresAt: item.expiresAt,
      },
    });
  }

  console.log(`Pantry seeded with ${pantrySeedItems.length} items.`);
}

async function main() {
  await seedFoodKnowledge();
  await seedPantry();
}

main()
  .catch((error) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
