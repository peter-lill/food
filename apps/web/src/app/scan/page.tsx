import Link from "next/link";
import { AddPantryForm } from "@/components/pantry/PantryManager";
import { getProductCatalogue } from "@/lib/products/product-catalogue.repository";
import { ScannerCloseButton } from "./ScannerCloseButton";
import styles from "./scan.module.css";

export const dynamic = "force-dynamic";

async function loadProducts() {
  try {
    return { products: await getProductCatalogue(), loadError: false };
  } catch (error) {
    console.error("Unable to load products for barcode scanning", error);
    return { products: [], loadError: true };
  }
}

export default async function ScanPage() {
  const { products, loadError } = await loadProducts();

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

  return (
    <div className={styles.workspace}>
      <ScannerCloseButton />
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
      <AddPantryForm autoOpenScanner fullPageScanner products={products} />
      <nav aria-label="Scanner shortcuts" className={styles.shortcuts}>
        <Link className="secondary-button" href="/products">Product Hub</Link>
        <Link className="secondary-button" href="/pantry">Pantry</Link>
        <Link className="secondary-button" href="/receipts">Scan receipt</Link>
      </nav>
    </div>
  );
}
