import "dotenv/config";
import { InventoryLocation } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const dayInMilliseconds = 24 * 60 * 60 * 1000;

function daysFromToday(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setTime(date.getTime() + days * dayInMilliseconds);
  return date;
}

const pantrySeedItems = [
  {
    name: "Chicken breast",
    quantity: 2.4,
    unit: "kg",
    location: InventoryLocation.FRIDGE,
    purchasedAt: daysFromToday(-1),
    expiresAt: daysFromToday(3),
  },
  {
    name: "Greek yoghurt",
    quantity: 1,
    unit: "tub",
    location: InventoryLocation.FRIDGE,
    purchasedAt: daysFromToday(-3),
    expiresAt: daysFromToday(1),
  },
  {
    name: "Salmon",
    quantity: 3,
    unit: "fillets",
    location: InventoryLocation.FREEZER,
    purchasedAt: daysFromToday(-5),
    expiresAt: daysFromToday(30),
  },
  {
    name: "Brown rice",
    quantity: 1.6,
    unit: "kg",
    location: InventoryLocation.PANTRY,
    purchasedAt: daysFromToday(-10),
    expiresAt: daysFromToday(180),
  },
] as const;

async function main() {
  const existingItems = await prisma.inventoryItem.count();

  if (existingItems > 0) {
    console.log(`Pantry seed skipped: ${existingItems} existing item(s) found.`);
    return;
  }

  for (const item of pantrySeedItems) {
    const product = await prisma.product.create({
      data: { name: item.name },
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

main()
  .catch((error) => {
    console.error("Pantry seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
