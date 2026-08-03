import Link from "next/link";
import { getProductHubList } from "@/lib/products/product-hub.repository";
import { RetailerLogo } from "@/components/retailers/RetailerLogo";
import styles from "./products-hub.module.css";

export const dynamic = "force-dynamic";

type ProductView = "all" | "pantry" | "priced" | "recipes" | "needs-details";
type ProductsPageProps = { searchParams: Promise<{ q?: string; view?: string }> };
type CompletionProduct = {
  name: string;
  canonicalName: string | null;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
  barcode: string | null;
  latestPrice: number | null;
  recipeCount: number;
};

const genericFoodTerms = [
  "apple", "avocado", "banana", "bean", "beetroot", "broccoli", "cabbage", "capsicum",
  "carrot", "cauliflower", "celery", "cucumber", "garlic", "ginger", "grape", "lemon",
  "lettuce", "lime", "mango", "mushroom", "onion", "orange", "pear", "potato", "pumpkin",
  "spinach", "sweet potato", "tomato", "watermelon", "zucchini",
] as const;

function money(value: number | null) {
  return value === null ? null : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function observedLabel(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(value) : null;
}

function imageVersion(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function normaliseView(value: string | undefined): ProductView {
  return ["pantry", "priced", "recipes", "needs-details"].includes(value ?? "") ? value as ProductView : "all";
}

function normaliseName(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function collapseRepeatedPhrase(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  for (let size = 1; size <= Math.floor(words.length / 2); size += 1) {
    if (words.length % size !== 0) continue;
    const phrase = words.slice(0, size).join(" ");
    const repeated = Array.from({ length: words.length / size }, () => phrase).join(" ");
    if (normaliseName(repeated) === normaliseName(value)) return phrase;
  }
  return value.trim();
}

function productDisplay(product: { name: string; canonicalName: string | null; category: string | null }) {
  const rawName = collapseRepeatedPhrase(product.name);
  const canonicalName = product.canonicalName ? collapseRepeatedPhrase(product.canonicalName) : null;
  const title = canonicalName || rawName || "Product";
  const receiptName = rawName && normaliseName(rawName) !== normaliseName(title) ? rawName : null;
  const category = product.category && ![title, canonicalName, rawName]
    .filter(Boolean)
    .some((value) => normaliseName(product.category ?? "") === normaliseName(value ?? ""))
    ? collapseRepeatedPhrase(product.category)
    : null;
  return { title, receiptName, category };
}

function isGenericFood(product: Pick<CompletionProduct, "name" | "canonicalName" | "brand" | "barcode" | "category" | "recipeCount">) {
  if (product.brand || product.barcode) return false;
  if (product.recipeCount > 0) return true;
  const category = normaliseName(product.category ?? "");
  if (/produce|fruit|vegetable|fresh food/.test(category)) return true;
  const name = normaliseName(product.name || product.canonicalName || "");
  return genericFoodTerms.some((term) => name === term || name.endsWith(` ${term}`) || name.startsWith(`${term} `));
}

function needsDetails(product: CompletionProduct) {
  if (product.barcode) return false;
  if (isGenericFood(product)) return !product.name.trim();
  return !product.imageUrl || !product.category || !product.brand;
}

function completionScore(product: CompletionProduct) {
  if (product.barcode) return 100;
  if (isGenericFood(product)) return product.name.trim() ? 100 : 0;
  const checks = [Boolean(product.name), Boolean(product.category), Boolean(product.brand), Boolean(product.imageUrl)];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function ProductActions() {
  return (
    <div className={styles.heroActions}>
      <Link className={styles.primaryAction} href="/scan"><span aria-hidden="true">▦</span>Scan barcode</Link>
      <Link className={styles.secondaryAction} href="/receipts"><span aria-hidden="true">⌁</span>Import receipt</Link>
      <Link className={styles.secondaryAction} href="/admin/product-intelligence"><span aria-hidden="true">⚙</span>Catalogue Manager</Link>
    </div>
  );
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { q = "", view: rawView } = await searchParams;
  const view = normaliseView(rawView);
  const allProducts = await getProductHubList(q);

  const counts: Record<ProductView, number> = {
    all: allProducts.length,
    pantry: allProducts.filter((product) => product.pantryQuantity > 0).length,
    priced: allProducts.filter((product) => product.latestPrice !== null).length,
    recipes: allProducts.filter((product) => product.recipeCount > 0).length,
    "needs-details": allProducts.filter(needsDetails).length,
  };

  const products = allProducts.filter((product) => {
    if (view === "pantry") return product.pantryQuantity > 0;
    if (view === "priced") return product.latestPrice !== null;
    if (view === "recipes") return product.recipeCount > 0;
    if (view === "needs-details") return needsDetails(product);
    return true;
  });

  const retailerCount = new Set(allProducts.flatMap((product) => product.latestRetailer ? [product.latestRetailer] : [])).size;
  const linkedRecipeCount = allProducts.reduce((total, product) => total + product.recipeCount, 0);
  const views: Array<{ value: ProductView; label: string }> = [
    { value: "all", label: "All" },
    { value: "pantry", label: "In pantry" },
    { value: "priced", label: "Priced" },
    { value: "recipes", label: "In recipes" },
    { value: "needs-details", label: "Needs attention" },
  ];

  return (
    <main className={styles.page}>
      <section className={styles.desktopHero}>
        <div className={styles.heroCopy}>
          <div className={styles.heroHeading}>
            <span className={styles.heroMark} aria-hidden="true">◈</span>
            <div><p className="eyebrow">PRODUCT LIBRARY</p><h1 className="page-title">Your products</h1></div>
          </div>
          <ProductActions />
        </div>
        <div className={styles.heroMetric}>
          <span>Library</span><strong>{allProducts.length}</strong><small>known products</small>
          <div className={styles.heroProgress}><span style={{ width: `${allProducts.length ? ((allProducts.length - counts["needs-details"]) / allProducts.length) * 100 : 0}%` }} /></div>
          <small>{counts["needs-details"]} need more details</small>
        </div>
      </section>

      <section className={styles.mobileHero}>
        <div className={styles.mobileHeroHeading}>
          <span className={styles.mobileHeroMark} aria-hidden="true">◈</span>
          <div><p className="eyebrow">PRODUCT LIBRARY</p><h1>Your products</h1></div>
        </div>
        <ProductActions />
      </section>

      <section className={styles.summaryGrid} aria-label="Product catalogue summary">
        <article className={styles.summaryCard}><span className={styles.summaryIcon}>□</span><div><strong>{counts.pantry}</strong><small>in your pantry</small></div></article>
        <article className={styles.summaryCard}><span className={styles.summaryIcon}>$</span><div><strong>{counts.priced}</strong><small>with price history</small></div></article>
        <article className={styles.summaryCard}><span className={styles.summaryIcon}>◇</span><div><strong>{linkedRecipeCount}</strong><small>recipe links</small></div></article>
        <article className={styles.summaryCard}><span className={styles.summaryIcon}>⌂</span><div><strong>{retailerCount}</strong><small>retailers tracked</small></div></article>
      </section>

      <section className={styles.cataloguePanel}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarTitle}>
            <p className="eyebrow">CATALOGUE</p>
            <h2>{products.length} {products.length === 1 ? "product" : "products"}</h2>
            {q ? <p>Results for “{q}”</p> : <p>Browse, clean up and open product records.</p>}
          </div>
          <form className={styles.search}>
            {view !== "all" ? <input name="view" type="hidden" value={view} /> : null}
            <div className={styles.searchField}><span aria-hidden="true">⌕</span><input aria-label="Search products" defaultValue={q} name="q" placeholder="Search name, brand or barcode" type="search" /></div>
            <button className={styles.searchButton} type="submit">Search</button>
          </form>
        </div>

        <nav aria-label="Filter products" className={styles.filters}>
          {views.map((item) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (item.value !== "all") params.set("view", item.value);
            return <Link className={view === item.value ? styles.filterActive : styles.filter} href={params.size ? `/products?${params.toString()}` : "/products"} key={item.value}><span>{item.label}</span><strong>{counts[item.value]}</strong></Link>;
          })}
        </nav>

        <div className={styles.grid} aria-label="Products">
          {products.length ? products.map((product) => {
            const href = `/products/${encodeURIComponent(product.slug ?? product.id)}`;
            const { title, receiptName, category } = productDisplay(product);
            const latestPrice = money(product.latestPrice);
            const completeness = completionScore(product);
            const observed = observedLabel(product.latestObservedAt);
            const generic = isGenericFood(product);
            const detailLine = generic ? null : [product.brand, product.barcode ? `Barcode ${product.barcode}` : null].filter(Boolean).join(" · ") || "Brand not added";
            const productImage = product.imageUrl
              ? `/api/products/${encodeURIComponent(product.id)}/image?v=${encodeURIComponent(imageVersion(product.imageUrl))}`
              : null;

            return (
              <article className={styles.card} key={product.id}>
                <div className={styles.thumb}>
                  {productImage ? (
                    <img
                      alt={title}
                      loading="lazy"
                      src={productImage}
                      style={{
                        display: "block",
                        width: "112px",
                        height: "112px",
                        maxWidth: "calc(100% - 36px)",
                        maxHeight: "calc(100% - 36px)",
                        objectFit: "contain",
                        objectPosition: "center",
                        padding: "8px",
                        borderRadius: "18px",
                        background: "#fff",
                        boxSizing: "border-box",
                      }}
                    />
                  ) : <div className={styles.imageFallback} aria-hidden="true"><span>◈</span><small>{generic ? "Fresh produce" : "Image pending"}</small></div>}
                  <div className={styles.badges}>
                    {product.pantryQuantity > 0 ? <span className={styles.pantryBadge}>In pantry</span> : null}
                    {needsDetails(product) ? <span className={styles.attentionBadge}>Needs details</span> : null}
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardTopline}>
                    <span>{category ?? (generic ? "Fresh produce" : "Uncategorised")}</span>
                    {completeness < 100 ? <span>{completeness}% complete</span> : null}
                  </div>
                  <h2>{title}</h2>
                  {receiptName ? <p className={styles.receiptName}>{receiptName}</p> : null}
                  {detailLine ? <p className={styles.brandLine}>{detailLine}</p> : null}
                  {completeness < 100 ? <div className={styles.completeness} aria-label={`${completeness}% product information complete`}><span style={{ width: `${completeness}%` }} /></div> : null}
                  <div className={styles.priceRow}>
                    <div><small>Latest price</small><strong>{latestPrice ?? "Not priced"}</strong></div>
                    <div><small>{observed ? `Seen ${observed}` : "Retailer"}</small><strong>{product.latestRetailer ? <RetailerLogo compact retailer={product.latestRetailer} /> : "Not linked"}</strong></div>
                  </div>
                  <div className={styles.meta}>
                    {product.recipeCount > 0 ? <span>{product.recipeCount} recipe{product.recipeCount === 1 ? "" : "s"}</span> : null}
                    {product.retailerCount > 0 ? <span>{product.retailerCount} retailer{product.retailerCount === 1 ? "" : "s"}</span> : null}
                    {product.aliasCount > 0 ? <span>{product.aliasCount} alias{product.aliasCount === 1 ? "" : "es"}</span> : null}
                    {!generic && !product.imageUrl && product.barcode ? <span>Enrichment pending</span> : null}
                    {!generic && !product.imageUrl && !product.barcode ? <span>Image missing</span> : null}
                  </div>
                  <span className={styles.openLabel}>View product <span aria-hidden="true">→</span></span>
                </div>
                <Link aria-label={`Open ${title}`} className={styles.cardLink} href={href} />
              </article>
            );
          }) : (
            <div className={styles.empty}>
              <span aria-hidden="true">⌕</span><strong>No products found</strong><p>Try another search or filter.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
