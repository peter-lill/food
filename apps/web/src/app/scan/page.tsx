import Link from "next/link";
import { AddPantryForm } from "@/components/pantry/PantryManager";
import { getProductCatalogue } from "@/lib/products/product-catalogue.repository";
import { getShoppingListOptions } from "@/lib/shopping/shopping.repository";
import { NavigationIcon } from "@/components/navigation/NavigationIcon";
import { ReceiptCamera } from "./ReceiptCamera";
import { ScannerCloseButton } from "./ScannerCloseButton";
import { ScannerFlashlightButton } from "./ScannerFlashlightButton";
import styles from "./scan.module.css";

export const dynamic = "force-dynamic";

async function loadScannerData() {
  try {
    const [products, shoppingLists] = await Promise.all([
      getProductCatalogue(),
      getShoppingListOptions(),
    ]);
    return { products, shoppingLists, loadError: false };
  } catch (error) {
    console.error("Unable to load products for barcode scanning", error);
    return { products: [], shoppingLists: [], loadError: true };
  }
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string | string[]; list?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedTarget = Array.isArray(params.target) ? params.target[0] : params.target;
  const target = requestedTarget === "shopping" || requestedTarget === "pantry" ? requestedTarget : "receipt";
  const requestedListId = Array.isArray(params.list) ? params.list[0] : params.list;
  const { products, shoppingLists, loadError } = await loadScannerData();
  const shoppingList = shoppingLists.find((list) => list.id === requestedListId) ?? shoppingLists[0] ?? null;

  if (loadError) {
    return (
      <div className="card pantry-error" role="alert">
        <strong>Product lookup is unavailable.</strong>
        <p>Check the PostgreSQL connection and refresh this page.</p>
        <div className="form-actions">
          <Link className="secondary-button" href="/products">Open Product Hub</Link>
          <Link className="secondary-button" href="/pantry">Add manually</Link>
        </div>
      </div>
    );
  }

  const headings = target === "receipt"
    ? { title: "Scan a receipt", help: "Fit the entire receipt inside the frame" }
    : target === "shopping"
      ? { title: "Add to Shopping", help: shoppingList ? `Adding products to ${shoppingList.name}` : "Create a Shopping list before scanning" }
      : { title: "Add to Pantry", help: "Point the camera at a product barcode" };

  return (
    <div className={styles.workspace}>
      <header className={styles.scannerHeader}>
        <div><strong>{headings.title}</strong><small>{headings.help}</small></div>
        <div className={styles.headerActions}><ScannerFlashlightButton /><ScannerCloseButton /></div>
      </header>
      <datalist id="pantry-units">
        <option value="item" />
        <option value="pack" />
        <option value="g" />
        <option value="kg" />
        <option value="mL" />
        <option value="L" />
        <option value="tub" />
        <option value="fillet" />
      </datalist>
      {target === "receipt" ? <ReceiptCamera /> : target === "shopping" && !shoppingList ? (
        <div className={styles.emptyTarget}>
          <section className="card pantry-empty">
            <strong>Create a Shopping list first.</strong>
            <p>The barcode scanner needs a list to receive scanned products.</p>
            <Link className="primary-button" href="/shopping">Open Shopping</Link>
          </section>
        </div>
      ) : <AddPantryForm autoOpenScanner fullPageScanner products={products} scanTarget={target} shoppingListId={shoppingList?.id} />}
      <nav aria-label="Choose scan destination" className={styles.modeSelector}>
        <Link aria-current={target === "pantry" ? "page" : undefined} className={target === "pantry" ? styles.activeMode : ""} href="/scan?target=pantry"><span><NavigationIcon name="pantry" /></span><small>Pantry</small></Link>
        <Link aria-current={target === "receipt" ? "page" : undefined} className={target === "receipt" ? styles.activeMode : ""} href="/scan?target=receipt"><span><NavigationIcon name="receipts" /></span><small>Receipt</small></Link>
        <Link aria-current={target === "shopping" ? "page" : undefined} className={target === "shopping" ? styles.activeMode : ""} href="/scan?target=shopping"><span><NavigationIcon name="shopping" /></span><small>Shopping</small></Link>
      </nav>
      <nav aria-label="Scanner shortcuts" className={styles.shortcuts}>
        <Link className="secondary-button" href="/products">Product Hub</Link>
        <Link className="secondary-button" href={target === "shopping" ? "/shopping" : "/pantry"}>{target === "shopping" ? "Shopping" : "Pantry"}</Link>
        <Link className="secondary-button" href="/receipts">Scan receipt</Link>
      </nav>
    </div>
  );
}
