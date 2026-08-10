import Link from "next/link";
import { ReceiptWorkspace } from "@/components/receipts/ReceiptWorkspace";
import { getReceiptImports } from "@/lib/receipts/receipt.repository";
import styles from "./receipts.module.css";

export const dynamic = "force-dynamic";

async function loadReceiptsPageData() {
  try {
    return { receipts: await getReceiptImports(), loadError: false };
  } catch (error) {
    console.error("Unable to load receipts", error);
    return { receipts: [], loadError: true };
  }
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ capture?: string | string[] }>;
}) {
  const params = await searchParams;
  const loadStagedCapture = (Array.isArray(params.capture) ? params.capture[0] : params.capture) === "staged";
  const { receipts, loadError } = await loadReceiptsPageData();

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="eyebrow">SMART RECEIPT IMPORT</p>
          <h1 className="page-title">Receipts</h1>
          <p className={styles.heroDescription}>Turn a supermarket receipt into reviewed Pantry items and reliable price history.</p>
          <div className={styles.steps} aria-label="Receipt import steps">
            <span>1. Capture</span>
            <span>2. Check</span>
            <span>3. Import</span>
          </div>
        </div>
        <Link className={`secondary-button ${styles.priceLink}`} href="/prices">View price history</Link>
      </header>
      <ReceiptWorkspace loadError={loadError} loadStagedCapture={loadStagedCapture} receipts={receipts} />
    </div>
  );
}
