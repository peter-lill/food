import Link from "next/link";
import { PriceHistoryWorkspace } from "@/components/prices/PriceHistoryWorkspace";
import { getReceiptPriceHistory } from "@/lib/prices/price-history.repository";
import type { PriceHistoryData } from "@/lib/prices/price-history.types";

export const dynamic = "force-dynamic";

const emptyData: PriceHistoryData = {
  products: [],
  productCount: 0,
  observationCount: 0,
  retailerCount: 0,
  retailers: [],
};

async function loadPricesPageData() {
  try {
    return { data: await getReceiptPriceHistory(), loadError: false };
  } catch (error) {
    console.error("Unable to load receipt price history", error);
    return { data: emptyData, loadError: true };
  }
}

export default async function PricesPage() {
  const { data, loadError } = await loadPricesPageData();

  return (
    <>
      <header className="pantry-page-heading">
        <div>
          <h1 className="page-title">Prices</h1>
          <p className="subtle">Compare what you paid across imported receipts and retailers.</p>
        </div>
        <Link className="secondary-button" href="/receipts">View receipts</Link>
      </header>
      <PriceHistoryWorkspace data={data} loadError={loadError} />
    </>
  );
}
