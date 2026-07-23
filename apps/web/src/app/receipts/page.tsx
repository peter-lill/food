import Link from "next/link";
import { ReceiptWorkspace } from "@/components/receipts/ReceiptWorkspace";
import { getReceiptImports } from "@/lib/receipts/receipt.repository";

export const dynamic = "force-dynamic";

async function loadReceiptsPageData() {
  try {
    return { receipts: await getReceiptImports(), loadError: false };
  } catch (error) {
    console.error("Unable to load receipts", error);
    return { receipts: [], loadError: true };
  }
}

export default async function ReceiptsPage() {
  const { receipts, loadError } = await loadReceiptsPageData();

  return (
    <>
      <header className="pantry-page-heading">
        <div>
          <h1 className="page-title">Receipts</h1>
          <p className="subtle">Review purchases before adding food to your Pantry.</p>
        </div>
        <Link className="secondary-button" href="/prices">View price history</Link>
      </header>
      <ReceiptWorkspace loadError={loadError} receipts={receipts} />
    </>
  );
}
