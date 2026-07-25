import Link from "next/link";
import { AddPantryForm } from "@/components/pantry/PantryManager";
import { getProductCatalogue } from "@/lib/products/product-catalogue.repository";
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

  return (
    <>
      <header className="pantry-page-heading">
        <div>
          <p className="eyebrow">QUICK ADD</p>
          <h1 className="page-title">Scan a product</h1>
          <p className="subtle">Scan a barcode, confirm the quantity and save the product directly to Pantry.</p>
        </div>
        <Link className="secondary-button" href="/pantry">View Pantry</Link>
      </header>

      {loadError ? (
        <div className="card pantry-error" role="alert">
          <strong>Product lookup is unavailable.</strong>
          <p>Check the PostgreSQL connection and refresh this page.</p>
        </div>
      ) : (
        <div className={styles.workspace}>
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
          <AddPantryForm autoOpenScanner products={products} />
        </div>
      )}
    </>
  );
}
