import { prisma } from "@/lib/prisma";
import { formatProductName } from "@/lib/products/product-formatter";
import { foodItemIdentity, isPlausibleGroceryName } from "@/lib/products/food-item-intelligence";
import { consolidatePantryItems } from "./pantry-consolidation";
import type {
  PantryGroup,
  PantryItem,
  PantryLocation,
  PantryQuantitySummary,
} from "./pantry.types";

const useSoonWindowMs = 3 * 24 * 60 * 60 * 1000;

function getExpiryStatus(expiresAt: Date | null, now = new Date()) {
  if (!expiresAt) return { useSoon: false, expired: false };

  const expiryEndOfDay = new Date(expiresAt);
  expiryEndOfDay.setUTCHours(23, 59, 59, 999);
  const difference = expiryEndOfDay.getTime() - now.getTime();

  return {
    expired: difference < 0,
    useSoon: difference >= 0 && difference <= useSoonWindowMs,
  };
}

function categoryFor(value: string, explicit: string | null) {
  if (explicit) return explicit;
  const name = value.toLocaleLowerCase("en-AU");
  if (/apple|banana|tomato|potato|onion|garlic|lemon|lime|avocado|broccoli|carrot|capsicum|cucumber|lettuce|spinach|mushroom|herb|mint|parsley|coriander/.test(name)) return "Fresh produce";
  if (/beef|chicken|lamb|pork|fish|salmon|prawn|seafood|mince|steak/.test(name)) return "Meat & seafood";
  if (/milk|cheese|cream|butter|yoghurt|yogurt|egg/.test(name)) return "Dairy & eggs";
  if (/frozen|ice cream/.test(name)) return "Frozen";
  if (/juice|water|coffee|tea|soft drink|cola|pepsi/.test(name)) return "Drinks";
  if (/cleaner|detergent|tissue|paper towel|toilet paper|soap|foil|bag/.test(name)) return "Household";
  return "Pantry staples";
}

function quantitySummary(items: PantryItem[]): PantryQuantitySummary[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const unit = item.unit.trim() || "item";
    totals.set(unit, (totals.get(unit) ?? 0) + item.quantity);
  }
  return [...totals.entries()].map(([unit, quantity]) => ({ unit, quantity }));
}

export async function getPantryItems(): Promise<PantryGroup[]> {
  await consolidatePantryItems();

  const rows = await prisma.inventoryItem.findMany({
    include: {
      product: {
        include: { foodKnowledge: true },
      },
    },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });

  const mapped = rows.flatMap((row) => {
    const expiryStatus = getExpiryStatus(row.expiresAt);
    const sourceName = row.product.foodKnowledge?.commonName
      ?? row.product.canonicalName
      ?? row.product.name;

    if (!isPlausibleGroceryName(sourceName)) return [];

    const identity = foodItemIdentity(sourceName);
    if (!identity) return [];

    const item: PantryItem = {
      id: row.id,
      productId: row.productId,
      name: formatProductName(sourceName),
      barcode: row.product.barcode,
      location: row.location as PantryLocation,
      quantity: row.quantity,
      unit: row.unit,
      expiresAt: row.expiresAt?.toISOString().slice(0, 10) ?? null,
      purchasedAt: row.purchasedAt?.toISOString().slice(0, 10) ?? null,
      ...expiryStatus,
    };

    return [{
      item,
      canonicalName: formatProductName(identity),
      identity,
      category: categoryFor(identity, row.product.foodKnowledge?.category ?? row.product.category),
      imageUrl: row.product.imageUrl,
    }];
  });

  const groups = new Map<string, typeof mapped>();
  for (const record of mapped) {
    const key = record.identity || record.item.productId;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, records]): PantryGroup => {
    const items = records.map((record) => record.item);
    const expiryDates = items.map((item) => item.expiresAt).filter((value): value is string => Boolean(value));
    return {
      key,
      canonicalName: records[0].canonicalName,
      category: records[0].category,
      productId: records[0].item.productId,
      imageUrl: records.find((record) => record.imageUrl)?.imageUrl ?? null,
      locations: [...new Set(items.map((item) => item.location))],
      quantities: quantitySummary(items),
      earliestExpiry: expiryDates.sort()[0] ?? null,
      useSoon: items.some((item) => item.useSoon),
      expired: items.some((item) => item.expired),
      recordCount: items.length,
      items,
    };
  }).sort((left, right) => left.category.localeCompare(right.category) || left.canonicalName.localeCompare(right.canonicalName));
}
