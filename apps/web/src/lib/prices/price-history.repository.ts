import { prisma } from "@/lib/prisma";
import type {
  PriceHistoryData,
  PriceHistoryObservation,
  ProductPriceHistory,
  RetailerPriceSummary,
} from "./price-history.types";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function singularUnit(unit: string) {
  if (unit === "items") return "item";
  if (unit === "packs") return "pack";
  if (unit === "tins") return "tin";
  if (unit === "cans") return "can";
  return unit;
}

function comparablePrice(linePrice: number, quantity: number | null, rawUnit: string | null) {
  const safeQuantity = quantity && quantity > 0 ? quantity : 1;
  const unit = rawUnit?.trim().toLocaleLowerCase("en-AU") ?? "item";

  if (unit === "kg" || unit === "kilogram" || unit === "kilograms") {
    return { comparisonPrice: (linePrice / (safeQuantity * 1000)) * 100, comparisonLabel: "per 100 g" };
  }

  if (unit === "g" || unit === "gram" || unit === "grams") {
    return { comparisonPrice: (linePrice / safeQuantity) * 100, comparisonLabel: "per 100 g" };
  }

  if (unit === "l" || unit === "litre" || unit === "litres" || unit === "liter" || unit === "liters") {
    return { comparisonPrice: linePrice / safeQuantity, comparisonLabel: "per L" };
  }

  if (unit === "ml" || unit === "millilitre" || unit === "millilitres" || unit === "milliliter" || unit === "milliliters") {
    return { comparisonPrice: (linePrice / safeQuantity) * 1000, comparisonLabel: "per L" };
  }

  return {
    comparisonPrice: linePrice / safeQuantity,
    comparisonLabel: `per ${singularUnit(unit || "item")}`,
  };
}

function retailerSummaries(observations: PriceHistoryObservation[]): RetailerPriceSummary[] {
  const grouped = new Map<string, PriceHistoryObservation[]>();

  for (const observation of observations) {
    const existing = grouped.get(observation.retailer) ?? [];
    existing.push(observation);
    grouped.set(observation.retailer, existing);
  }

  return Array.from(grouped.entries())
    .map(([retailer, entries]) => {
      const prices = entries.map((entry) => entry.comparisonPrice);
      return {
        retailer,
        observationCount: entries.length,
        latestPrice: roundMoney(entries[0].comparisonPrice),
        lowestPrice: roundMoney(Math.min(...prices)),
        averagePrice: roundMoney(average(prices)),
        latestPurchasedAt: entries[0].purchasedAt,
      };
    })
    .sort((a, b) => a.latestPrice - b.latestPrice || a.retailer.localeCompare(b.retailer));
}

function buildProductHistory(key: string, observations: PriceHistoryObservation[]): ProductPriceHistory {
  observations.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
  const latest = observations[0];
  const comparable = observations.filter((observation) => observation.comparisonLabel === latest.comparisonLabel);
  const prices = comparable.map((observation) => observation.comparisonPrice);
  const previousPrice = comparable[1]?.comparisonPrice ?? null;
  const changeAmount = previousPrice === null ? null : latest.comparisonPrice - previousPrice;
  const changePercent = previousPrice && previousPrice > 0 ? (changeAmount! / previousPrice) * 100 : null;

  return {
    key,
    name: latest.productName,
    comparisonLabel: latest.comparisonLabel,
    observationCount: observations.length,
    latestPrice: roundMoney(latest.comparisonPrice),
    previousPrice: previousPrice === null ? null : roundMoney(previousPrice),
    lowestPrice: roundMoney(Math.min(...prices)),
    highestPrice: roundMoney(Math.max(...prices)),
    averagePrice: roundMoney(average(prices)),
    changeAmount: changeAmount === null ? null : roundMoney(changeAmount),
    changePercent: changePercent === null ? null : Math.round(changePercent * 10) / 10,
    latestPurchasedAt: latest.purchasedAt,
    retailers: retailerSummaries(comparable),
    observations,
  };
}

export async function getReceiptPriceHistory(): Promise<PriceHistoryData> {
  const receiptItems = await prisma.receiptItem.findMany({
    where: {
      isFood: true,
      normalisedName: { not: null },
      price: { gt: 0 },
      receiptImport: { status: "IMPORTED" },
    },
    select: {
      id: true,
      normalisedName: true,
      quantity: true,
      unit: true,
      price: true,
      receiptImport: {
        select: {
          retailer: true,
          purchasedAt: true,
          createdAt: true,
        },
      },
    },
  });

  const grouped = new Map<string, PriceHistoryObservation[]>();
  const retailers = new Set<string>();

  for (const item of receiptItems) {
    if (!item.normalisedName || item.price === null) continue;

    const productName = item.normalisedName.trim();
    if (!productName) continue;

    const retailer = item.receiptImport.retailer?.trim() || "Unknown retailer";
    const purchasedAt = (item.receiptImport.purchasedAt ?? item.receiptImport.createdAt).toISOString();
    const comparison = comparablePrice(item.price, item.quantity, item.unit);
    const observation: PriceHistoryObservation = {
      id: item.id,
      productName,
      retailer,
      purchasedAt,
      linePrice: roundMoney(item.price),
      quantity: item.quantity,
      unit: item.unit,
      comparisonPrice: roundMoney(comparison.comparisonPrice),
      comparisonLabel: comparison.comparisonLabel,
    };

    const key = productName.toLocaleLowerCase("en-AU");
    const existing = grouped.get(key) ?? [];
    existing.push(observation);
    grouped.set(key, existing);
    retailers.add(retailer);
  }

  const products = Array.from(grouped.entries())
    .map(([key, observations]) => buildProductHistory(key, observations))
    .sort((a, b) => b.latestPurchasedAt.localeCompare(a.latestPurchasedAt) || a.name.localeCompare(b.name));

  return {
    products,
    productCount: products.length,
    observationCount: receiptItems.length,
    retailerCount: retailers.size,
    retailers: Array.from(retailers).sort((a, b) => a.localeCompare(b)),
  };
}
