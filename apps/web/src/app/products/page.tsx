import Link from "next/link";
import { getProductHubList } from "@/lib/products/product-hub.repository";
import styles from "./products-hub.module.css";

export const dynamic = "force-dynamic";

type ProductView = "all" | "pantry" | "priced" | "recipes" | "needs-details";

type ProductsPageProps = {
  searchParams: Promise<{ q?: string; view?: string }>;
};

function money(value: number | null) {
  return value === null
    ? null
    : new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
      }).format(value);
}

function normaliseView(value: string | undefined): ProductView {
  return ["pantry", "priced", "recipes", "needs-details"].includes(value ?? "")
    ? value as ProductView
    : "all";
}

const views: Array<{ value: ProductView; label: string }> = [
  { value: "all", label: "All products" },
  { value: "pantry", label: "In Pantry" },
  { value: "priced", label: "With prices" },
  { value: "recipes", label: "Used in recipes" },
  { value: "needs-details", label: "Missing information" },
];

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { q = "", view: rawView } = await searchParams;
  const view = normaliseView(rawView);
  const allProducts = await getProductHubList(q);
  const products = allProducts.filter((product) => {
    if (view === "pantry") return product.pantryQuantity > 0;
    if (view === "priced") return product.latestPrice !== null;
    if (view === "recipes") return product.recipeCount > 0;
    if (view === "needs-details") {
      return !product.imageUrl || !product.category || (!product.barcode && !product.brand);
    }
    return true;
  });

  const retailerCount = new Set(
    allProducts.flatMap((product) => product.latestRetailer ? [product.latestRetailer] : []),
  ).size;
  const linkedRecipeCount = allProducts.reduce((total, product) => total + product.recipeCount, 0);
  const pantryProductCount = allProducts.filter((product) => product.pantryQuantity > 0).length;
  const pricedProductCount = allProducts.filter((product) => product.latestPrice !== null).length;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="eyebrow">PRODUCT LIBRARY</p>
          <h1 className="page-title">Products</h1>
          <p className={styles.heroText}>
            One reliable product record shared by Pantry, Shopping, Recipes, Receipts,
            barcode scanning and supermarket prices.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/scan">Scan a barcode</Link>
            <Link className={styles.secondaryAction} href="/receipts">Capture a receipt</Link>
          </div>
        </div>
        <div className={styles.heroVisual} aria-hidden="true">
          <span>◈</span>
          <strong>{allProducts.length}</strong>
          <small>known products</small>
        </div>
      </section>

      <section className={styles.summaryGrid} aria-label="Product catalogue summary">
        <article className={styles.summaryCard}>
          <span className={styles.summaryIcon}>□</span>
          <div><strong>{pantryProductCount}</strong><small>currently in Pantry</small></div>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryIcon}>$</span>
          <div><strong>{pricedProductCount}</strong><small>with observed prices</small></div>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryIcon}>◇</span>
          <div><strong>{linkedRecipeCount}</strong><small>recipe connections</small></div>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryIcon}>⌂</span>
          <div><strong>{retailerCount}</strong><small>retailers represented</small></div>
        </article>
      </section>

      <section className={styles.cataloguePanel}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarTitle}>
            <p className="eyebrow">PRODUCT CATALOGUE</p>
            <h2>{products.length} {products.length === 1 ? "product" : "products"}</h2>
          </div>
          <form className={styles.search}>
            {view !== "all" ? <input name="view" type="hidden" value={view} /> : null}
            <input
              aria-label="Search products"
              defaultValue={q}
              name="q"
              placeholder="Search product, brand or barcode"
              type="search"
            />
            <button className={styles.searchButton} type="submit">Search</button>
          </form>
        </div>

        <nav aria-label="Filter products" className={styles.filters}>
          {views.map((item) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (item.value !== "all") params.set("view", item.value);
            const href = params.size ? `/products?${params.toString()}` : "/products";
            return (
              <Link
                className={view === item.value ? styles.filterActive : styles.filter}
                href={href}
                key={item.value}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.grid} aria-label="Products">
          {products.length ? products.map((product) => {
            const href = `/products/${encodeURIComponent(product.slug ?? product.id)}`;
            const displayName = product.name;
            const canonicalLabel = product.canonicalName && product.canonicalName !== product.name
              ? product.canonicalName
              : null;
            const latestPrice = money(product.latestPrice);
            const imageUrl = `/api/products/${encodeURIComponent(product.id)}/image`;

            return (
              <article className={styles.card} key={product.id}>
                <div className={styles.thumb}>
                  <span className={styles.imageFallback} aria-hidden="true">◈</span>
                  <img alt={displayName} loading="lazy" src={imageUrl} />
                  {product.pantryQuantity > 0 ? <span className={styles.pantryBadge}>In Pantry</span> : null}
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardTopline}>
                    <span>{canonicalLabel ?? product.category ?? product.brand ?? "Product"}</span>
                  </div>
                  <h2>{displayName}</h2>
                  <p className={styles.brandLine}>
                    {[product.brand, product.barcode ? `Barcode ${product.barcode}` : null]
                      .filter(Boolean)
                      .join(" · ") || "Food product"}
                  </p>
                  <div className={styles.priceRow}>
                    <div><small>Latest price</small><strong>{latestPrice ?? "Not priced"}</strong></div>
                    <div><small>Retailer</small><strong>{product.latestRetailer ?? "—"}</strong></div>
                  </div>
                  <div className={styles.meta}>
                    {product.recipeCount > 0 ? <span>{product.recipeCount} recipe{product.recipeCount === 1 ? "" : "s"}</span> : null}
                    {product.retailerCount > 0 ? <span>{product.retailerCount} retailer{product.retailerCount === 1 ? "" : "s"}</span> : null}
                    {product.aliasCount > 0 ? <span>{product.aliasCount} alias{product.aliasCount === 1 ? "" : "es"}</span> : null}
                  </div>
                  <span className={styles.openLabel}>Open product →</span>
                </div>
                <Link aria-label={`Open ${displayName}`} className={styles.cardLink} href={href} />
              </article>
            );
          }) : (
            <div className={styles.empty}>
              <span aria-hidden="true">⌕</span>
              <strong>No products matched.</strong>
              <p>Try another search or clear the selected filter.</p>
              <Link href="/products">Show all products</Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
