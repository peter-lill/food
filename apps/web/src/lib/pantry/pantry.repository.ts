import { prisma } from "@/lib/prisma";
import { formatProductName } from "@/lib/products/product-formatter";
import { consolidatePantryItems } from "./pantry-consolidation";
import type { PantryItem, PantryLocation } from "./pantry.types";

const useSoonWindowMs = 3 * 24 * 60 * 60 * 1000;

function getExpiryStatus(expiresAt: Date | null, now = new Date()) {
  if (!expiresAt) {
    return { useSoon: false, expired: false };
  }

  const expiryEndOfDay = new Date(expiresAt);
  expiryEndOfDay.setUTCHours(23, 59, 59, 999);
  const difference = expiryEndOfDay.getTime() - now.getTime();

  return {
    expired: difference < 0,
    useSoon: difference >= 0 && difference <= useSoonWindowMs,
  };
}

export async function getPantryItems(): Promise<PantryItem[]> {
  // A Pantry refresh is authoritative: variable-size count items such as salmon
  // fillets are merged, while fixed packaged goods retain distinct pack sizes.
  await consolidatePantryItems();

  const rows = await prisma.inventoryItem.findMany({
    include: { product: true },
    orderBy: [
      { expiresAt: "asc" },
      { createdAt: "desc" },
    ],
  });

  return rows.map((row) => {
    const expiryStatus = getExpiryStatus(row.expiresAt);
    const sourceName = row.product.canonicalName ?? row.product.name;

    return {
      id: row.id,
      name: formatProductName(sourceName),
      barcode: row.product.barcode,
      location: row.location as PantryLocation,
      quantity: row.quantity,
      unit: row.unit,
      expiresAt: row.expiresAt?.toISOString().slice(0, 10) ?? null,
      purchasedAt: row.purchasedAt?.toISOString().slice(0, 10) ?? null,
      ...expiryStatus,
    };
  });
}
