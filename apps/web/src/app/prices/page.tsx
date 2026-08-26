import Link from "next/link";
import { PriceComparisonGuide } from "@/components/prices/PriceComparisonGuide";
import { PriceHistoryWorkspace } from "@/components/prices/PriceHistoryWorkspace";
import { SupermarketComparisonWorkspace } from "@/components/prices/SupermarketComparisonWorkspace";
import { getReceiptPriceHistory } from "@/lib/prices/price-history.repository";
import type { PriceHistoryData } from "@/lib/prices/price-history.types";
import { getSupermarketComparisonData } from "@/lib/prices/supermarket-comparison.repository";
import type { SupermarketComparisonData } from "@/lib/prices/supermarket-comparison.types";
import { requireAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { enabledRetailers, retailerSetupStatus } from "@/lib/retailers/retailer-preferences";

export const dynamic = "force-dynamic";

const emptyHistoryData: PriceHistoryData = {
  products: [],
  productCount: 0,
  observationCount: 0,
  retailerCount: 0,
  retailers: [],
};

const emptyComparisonData: SupermarketComparisonData = {
  retailers: [],
  prices: [],
  shoppingLists: [],
  priceCount: 0,
  productCount: 0,
  latestCheckedAt: null,
};

async function loadPricesPageData(retailers: readonly ("Coles" | "Woolworths")[]) {
  const [historyResult, comparisonResult] = await Promise.allSettled([
    getReceiptPriceHistory(retailers),
    getSupermarketComparisonData(retailers),
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
  const session = await requireAuthSession();
  const [preference, savedPreferences, stores] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: session.user.id }, select: { homePostcode: true } }),
    prisma.retailerPreference.findMany({ where: { userId: session.user.id } }),
    prisma.preferredRetailerStore.findMany({ where: { userId: session.user.id, isPreferred: true }, select: { retailer: true, isPreferred: true } }),
  ]);
  const retailers = enabledRetailers(savedPreferences);
  const setup = retailerSetupStatus({ homePostcode: preference?.homePostcode, enabled: retailers, stores });
  const { historyData, historyError, comparisonData, comparisonError } = await loadPricesPageData(retailers);

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

      {!setup.ready ? (
        <section className="notice-panel" role="status">
          <div>
            <p className="eyebrow">FINISH PRICE SETUP</p>
            <h2 className="section-title">Choose your local retailers</h2>
            <p className="subtle">
              {setup.needsLocation ? "Add your home postcode. " : ""}
              {setup.needsRetailers ? "Enable at least one retailer. " : ""}
              {setup.missingStores.length ? `Choose preferred stores for ${setup.missingStores.join(" and ")}.` : ""}
            </p>
          </div>
          <Link className="primary-button" href="/account">Open profile setup</Link>
        </section>
      ) : null}

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
