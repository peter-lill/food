import { prisma } from "@/lib/prisma";
import type { PantryItem, PantryLocation } from "./pantry.types";

const useSoonWindowMs = 3 * 24 * 60 * 60 * 1000;

function getExpiryStatus(expiresAt: Date | null, now = new Date()) {
  if (!expiresAt) {
    return { useSoon: false, expired: false };
  }

  const difference = expiresAt.getTime() - now.getTime();

  return {
    expired: difference < 0,
    useSoon: difference >= 0 && difference <= useSoonWindowMs,
  };
}

export async function getPantryItems(): Promise<PantryItem[]> {
  const rows = await prisma.inventoryItem.findMany({
    include: { product: true },
    orderBy: [
      { expiresAt: "asc" },
      { createdAt: "desc" },
    ],
  });

  return rows.map((row) => {
    const expiryStatus = getExpiryStatus(row.expiresAt);

    return {
      id: row.id,
      name: row.product.name,
      location: row.location as PantryLocation,
      quantity: row.quantity,
      unit: row.unit,
      expiresAt: row.expiresAt?.toISOString().slice(0, 10) ?? null,
      purchasedAt: row.purchasedAt?.toISOString().slice(0, 10) ?? null,
      ...expiryStatus,
    };
  });
}
