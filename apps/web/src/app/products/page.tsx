import Link from "next/link";
import { getProductHubList } from "@/lib/products/product-hub.repository";
import styles from "./products.module.css";

export const dynamic = "force-dynamic";

type ProductsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

function money(value: number | null) {
  return value === null
    ? null
    : new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
      }).format(value);
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { q = "" } = await searchParams;
  const products = await getProductHubList(q);
  const retailerCount = new Set(
    products.flatMap((product) =>
      product.latestRetailer ? [product.latestRetailer] : [],
    ),
  ).size;
  const linkedRecipeCount = products.reduce((total, product) => total + product.recipeCount, 0);
  const pantryProductCount = products.filter((product) => product.pantryQuantity > 0).length;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="eyebrow">PRODUCT INTELLIGENCE</p>
          <h1 className="page-title">Product Hub</h1>
          <p className="subtle">
            The shared product catalogue behind recipes, pantry, shopping,
            receipts and supermarket prices.
          </p>
        </div>

        <form className={styles.search}>
          <input
            aria-label="Search products"
            defaultValue={q}
            name="q"
            placeholder="Search product, brand, alias or barcode"
            type="search"
          />
          <button className="primary-button" type="submit">Search</button>
        </form>
      </header>

      <section className={styles.summaryGrid} aria-label="Product catalogue summary">
        <div className={styles.summaryCard}>
          <span className="eyebrow">PRODUCTS</span>
          <strong>{products.length}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className="eyebrow">RECIPE LINKS</span>
          <strong>{linkedRecipeCount}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className="eyebrow">IN PANTRY</span>
          <strong>{pantryProductCount}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className="eyebrow">PRICED RETAILERS</span>
          <strong>{retailerCount}</strong>
        </div>
      </section>

      <section className={styles.grid} aria-label="Products">
        {products.length ? products.map((product) => {
          const href = `/products/${encodeURIComponent(product.slug ?? product.id)}`;
          const displayName = product.canonicalName ?? product.name;
          const latestPrice = money(product.latestPrice);

          return (
            <article className={styles.card} key={product.id}>
              <div className={styles.thumb}>
                {product.imageUrl ? <img alt="" src={product.imageUrl} /> : "◈"}
              </div>
              <div className={styles.cardBody}>
                <p className="eyebrow">{product.category ?? product.brand ?? "PRODUCT"}</p>
                <h2>{displayName}</h2>
                <p className="subtle">
                  {latestPrice && product.latestRetailer
                    ? `${latestPrice} · ${product.latestRetailer}`
                    : product.barcode
                      ? `Barcode ${product.barcode}`
                      : "Ready for enrichment"}
                </p>
                <div className={styles.meta}>
                  <span>{product.recipeCount} recipe{product.recipeCount === 1 ? "" : "s"}</span>
                  <span>{product.aliasCount} alias{product.aliasCount === 1 ? "" : "es"}</span>
                  <span>{product.retailerCount} retailer{product.retailerCount === 1 ? "" : "s"}</span>
                </div>
              </div>
              <Link aria-label={`Open ${displayName}`} className={styles.cardLink} href={href} />
            </article>
          );
        }) : (
          <div className={`card ${styles.empty}`}>
            <strong>No products matched.</strong>
            <p className="subtle">Try a broader product, brand, alias or barcode.</p>
          </div>
        )}
      </section>
    </div>
  );
}
