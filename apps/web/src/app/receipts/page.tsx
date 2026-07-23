import Link from "next/link";
import { ReceiptWorkspace } from "@/components/receipts/ReceiptWorkspace";
import { getReceiptImports } from "@/lib/receipts/receipt.repository";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  let loadError = false;
  const receipts = await getReceiptImports().catch((error) => {
    console.error("Unable to load receipts", error);
    loadError = true;
    return [];
  });

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
