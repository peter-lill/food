import Link from "next/link";
import { PriceComparisonGuide } from "@/components/prices/PriceComparisonGuide";
import { PriceHistoryWorkspace } from "@/components/prices/PriceHistoryWorkspace";
import { SupermarketComparisonWorkspace } from "@/components/prices/SupermarketComparisonWorkspace";
import { getReceiptPriceHistory } from "@/lib/prices/price-history.repository";
import type { PriceHistoryData } from "@/lib/prices/price-history.types";
import { getSupermarketComparisonData } from "@/lib/prices/supermarket-comparison.repository";
import type { SupermarketComparisonData } from "@/lib/prices/supermarket-comparison.types";

export const dynamic = "force-dynamic";

const emptyHistoryData: PriceHistoryData = {
  products: [],
  productCount: 0,
  observationCount: 0,
  retailerCount: 0,
  retailers: [],
};

const emptyComparisonData: SupermarketComparisonData = {
  prices: [],
  shoppingLists: [],
  priceCount: 0,
  productCount: 0,
  latestCheckedAt: null,
};

async function loadPricesPageData() {
  const [historyResult, comparisonResult] = await Promise.allSettled([
    getReceiptPriceHistory(),
    getSupermarketComparisonData(),
  ]);

  if (historyResult.status === "rejected") {
    console.error("Unable to load receipt price history", historyResult.reason);
  }

  if (comparisonResult.status === "rejected") {
    console.error("Unable to load supermarket comparisons", comparisonResult.reason);
  }

  return {
    historyData: historyResult.status === "fulfilled" ? historyResult.value : emptyHistoryData,
    historyError: historyResult.status === "rejected",
    comparisonData: comparisonResult.status === "fulfilled" ? comparisonResult.value : emptyComparisonData,
    comparisonError: comparisonResult.status === "rejected",
  };
}

export default async function PricesPage() {
  const { historyData, historyError, comparisonData, comparisonError } = await loadPricesPageData();

  return (
    <>
      <header className="pantry-page-heading">
        <div>
          <p className="eyebrow">PRICE INTELLIGENCE</p>
          <h1 className="page-title">Compare prices</h1>
          <p className="subtle">See shelf prices, comparable unit prices, retailer coverage and what you actually paid on imported receipts.</p>
        </div>
        <div className="form-actions">
          <Link className="secondary-button" href="/shopping">Open Shopping</Link>
          <Link className="secondary-button" href="/receipts">Import receipt</Link>
        </div>
      </header>

      <PriceComparisonGuide />
      <SupermarketComparisonWorkspace data={comparisonData} loadError={comparisonError} />

      <header className="pantry-page-heading">
        <div>
          <p className="eyebrow">WHAT YOU PAID</p>
          <h2 className="section-title">Receipt price history</h2>
          <p className="subtle">Track actual purchase prices separately from catalogue or live supermarket observations.</p>
        </div>
        <Link className="secondary-button" href="/receipts">View receipts</Link>
      </header>
      <PriceHistoryWorkspace data={historyData} loadError={historyError} />
    </>
  );
}
