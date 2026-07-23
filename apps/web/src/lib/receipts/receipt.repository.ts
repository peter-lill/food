import { prisma } from "@/lib/prisma";
import type { ReceiptDetail, ReceiptSummary } from "./receipt.types";

function dateOnly(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? null;
}

export async function getReceiptImports(limit = 30): Promise<ReceiptSummary[]> {
  const receipts = await prisma.receiptImport.findMany({
    include: {
      items: {
        select: { isFood: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return receipts.map((receipt) => ({
    id: receipt.id,
    retailer: receipt.retailer,
    purchasedAt: dateOnly(receipt.purchasedAt),
    total: receipt.total,
    status: receipt.status,
    importedAt: receipt.importedAt?.toISOString() ?? null,
    createdAt: receipt.createdAt.toISOString(),
    itemCount: receipt.items.length,
    reviewedCount: receipt.items.filter((item) => item.isFood !== null).length,
    foodCount: receipt.items.filter((item) => item.isFood === true).length,
  }));
}

export async function getReceiptImport(receiptId: string): Promise<ReceiptDetail | null> {
  const receipt = await prisma.receiptImport.findUnique({
    where: { id: receiptId },
    include: {
      items: {
        orderBy: { id: "asc" },
      },
    },
  });

  if (!receipt) return null;

  return {
    id: receipt.id,
    retailer: receipt.retailer,
    purchasedAt: dateOnly(receipt.purchasedAt),
    total: receipt.total,
    status: receipt.status,
    importedAt: receipt.importedAt?.toISOString() ?? null,
    createdAt: receipt.createdAt.toISOString(),
    items: receipt.items.map((item) => ({
      id: item.id,
      rawDescription: item.rawDescription,
      normalisedName: item.normalisedName,
      quantity: item.quantity,
      unit: item.unit,
      price: item.price,
      isFood: item.isFood,
      location: item.location,
      expiresAt: dateOnly(item.expiresAt),
    })),
  };
}
