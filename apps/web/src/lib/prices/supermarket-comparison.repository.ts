import { prisma } from "@/lib/prisma";
import {
  supermarketRetailers,
  type SupermarketComparisonData,
  type SupermarketPriceView,
  type SupermarketRetailer,
} from "./supermarket-comparison.types";

function normaliseName(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function getSupermarketComparisonData(): Promise<SupermarketComparisonData> {
  const [priceRows, shoppingLists] = await Promise.all([
    prisma.supermarketPrice.findMany({
      where: { retailer: { in: [...supermarketRetailers] } },
      orderBy: { checkedAt: "desc" },
      take: 1000,
    }),
    prisma.shoppingList.findMany({
      include: {
        items: {
          where: { checked: false },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const latestRows: SupermarketPriceView[] = [];
  const seen = new Set<string>();

  for (const row of priceRows) {
    const retailer = row.retailer as SupermarketRetailer;
    const key = [
      retailer,
      normaliseName(row.productName),
      normaliseName(row.brand ?? ""),
      normaliseName(row.packSize ?? ""),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    latestRows.push({
      id: row.id,
      retailer,
      productName: row.productName,
      brand: row.brand,
      packSize: row.packSize,
      price: row.price,
      unitPrice: row.unitPrice,
      isSpecial: row.isSpecial,
      checkedAt: row.checkedAt.toISOString(),
    });
  }

  const productNames = new Set(latestRows.map((price) => normaliseName(price.productName)));

  return {
    prices: latestRows,
    shoppingLists: shoppingLists.map((list) => ({
      id: list.id,
      name: list.name,
      items: list.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
      })),
    })),
    priceCount: latestRows.length,
    productCount: productNames.size,
    latestCheckedAt: latestRows[0]?.checkedAt ?? null,
  };
}
