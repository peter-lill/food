import { prisma } from "@/lib/prisma";
import {
  foodItemShape,
  normaliseGroceryUnit,
  pantryIdentity,
} from "@/lib/products/food-item-intelligence";

type InventoryRecord = {
  id: string;
  productId: string;
  location: "PANTRY" | "FRIDGE" | "FREEZER";
  quantity: number;
  unit: string;
  expiresAt: Date | null;
  purchasedAt: Date | null;
  product: {
    name: string;
    canonicalName: string | null;
    packSize: string | null;
    packQuantity: number | null;
    packUnit: string | null;
  };
};

function productName(item: InventoryRecord) {
  return item.product.canonicalName ?? item.product.name;
}

function inventoryUnit(item: InventoryRecord) {
  const shape = foodItemShape(productName(item));
  const unit = normaliseGroceryUnit(item.unit);
  if (shape === "COUNT_VARIABLE" && ["each", "item"].includes(unit)) return "each";
  return unit;
}

function inventoryKey(item: InventoryRecord) {
  const identity = pantryIdentity(productName(item));
  const shape = foodItemShape(productName(item));
  const unit = inventoryUnit(item);

  // Fixed packaged goods remain distinct by their actual retail pack size.
  const packIdentity = shape === "PACKAGED_FIXED"
    ? item.product.packSize
      ?? (item.product.packQuantity !== null && item.product.packUnit
        ? `${item.product.packQuantity}-${item.product.packUnit}`
        : item.productId)
    : "variable";

  return [item.location, identity, unit, packIdentity].join("|");
}

function earliestDate(values: Array<Date | null>) {
  return values
    .filter((value): value is Date => value !== null)
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

function latestDate(values: Array<Date | null>) {
  return values
    .filter((value): value is Date => value !== null)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

async function readInventory(): Promise<InventoryRecord[]> {
  return prisma.inventoryItem.findMany({
    include: {
      product: {
        select: {
          name: true,
          canonicalName: true,
          packSize: true,
          packQuantity: true,
          packUnit: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

export async function consolidatePantryItems() {
  const items = await readInventory();
  const groups = new Map<string, InventoryRecord[]>();

  for (const item of items) {
    const key = inventoryKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const [keeper, ...duplicates] = group;
    const quantity = group.reduce((total, item) => total + item.quantity, 0);

    await prisma.$transaction([
      prisma.inventoryItem.update({
        where: { id: keeper.id },
        data: {
          quantity,
          unit: inventoryUnit(keeper),
          expiresAt: earliestDate(group.map((item) => item.expiresAt)),
          purchasedAt: latestDate(group.map((item) => item.purchasedAt)),
        },
      }),
      prisma.inventoryItem.deleteMany({
        where: { id: { in: duplicates.map((item) => item.id) } },
      }),
    ]);
  }
}
