import Link from "next/link";
import { getProductDepartmentCounts, getProductHubList, type ProductHubListItem } from "@/lib/products/product-hub.repository";
import { productDepartment, supermarketDepartments, type SupermarketDepartment } from "@/lib/products/product-category";
import { RetailerLogo } from "@/components/retailers/RetailerLogo";
import { requireAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { enabledRetailers } from "@/lib/retailers/retailer-preferences";
import styles from "./products-hub.module.css";
import departmentStyles from "./department-artwork.module.css";

export const dynamic = "force-dynamic";

type ProductView = "all" | "pantry" | "priced" | "recipes" | "needs-details";
type ProductsPageProps = { searchParams: Promise<{ department?: string; q?: string; shelf?: string; view?: string }> };

const departmentArtwork: Record<string, string> = {
  "Fruit & vegetables": "fruit-vegetables.webp",
  Bakery: "bakery.webp",
  "Meat & seafood": "meat-seafood.webp",
  Deli: "meat-seafood.webp",
  "Dairy & eggs": "dairy-eggs.webp",
  Frozen: "frozen.webp",
  Pantry: "pantry.webp",
  International: "international.webp",
  Confectionery: "confectionery.webp",
  Drinks: "drinks.webp",
  "Health & personal care": "health-personal-care.webp",
  Household: "household.webp",
  Baby: "baby.webp",
  Pet: "pet.webp",
  Other: "other.webp",
};

function artworkForDepartment(department: string) {
  return `/category-artwork/${departmentArtwork[department] ?? departmentArtwork.Other}`;
}
type CompletionProduct = {
  name: string;
  canonicalName: string | null;
  imageUrl: string | null;
  category: string | null;
  shelfLabel: string | null;
  brand: string | null;
  barcode: string | null;
  productType: string;
  latestPrice: number | null;
  recipeCount: number;
  variantCount: number;
};

const genericFoodTerms = [
  "apple", "avocado", "banana", "bean", "beetroot", "broccoli", "cabbage", "capsicum",
  "carrot", "cauliflower", "celery", "cucumber", "garlic", "ginger", "grape", "lemon",
  "lettuce", "lime", "mango", "mushroom", "onion", "orange", "pear", "potato", "pumpkin",
  "rocket", "spinach", "stock cube", "sweet potato", "toast", "tomato", "watermelon", "zucchini",
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

function normaliseDepartment(value: string | undefined): SupermarketDepartment | null {
  return supermarketDepartments.includes(value as SupermarketDepartment) ? value as SupermarketDepartment : null;
}

function normaliseName(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function shelfGroupForDepartment(shelfLabel: string | null, department: string) {
  const fallbackLabel = department === "Other" ? "Unsorted products" : `Other ${department.toLocaleLowerCase("en-AU")} products`;
  if (!shelfLabel) return fallbackLabel;
  const shelf = normaliseName(shelfLabel);
  const parent = normaliseName(department);
  return shelf === parent || shelf.endsWith(parent)
    ? fallbackLabel
    : shelfLabel;
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

function isGenericFood(product: Pick<CompletionProduct, "name" | "canonicalName" | "brand" | "barcode" | "category" | "recipeCount" | "productType">) {
  if (product.productType === "GENERIC_PRODUCE") return true;
  if (product.brand || product.barcode) return false;
  if (product.recipeCount > 0) return true;
  const category = normaliseName(product.category ?? "");
  if (/produce|fruit|vegetable|fresh food/.test(category)) return true;
  const name = normaliseName(product.name || product.canonicalName || "");
  return genericFoodTerms.some((term) => name === term || name.endsWith(` ${term}`) || name.startsWith(`${term} `));
}

function needsDetails(product: CompletionProduct) {
  if (product.variantCount > 1) return false;
  if (product.barcode) return false;
  if (isGenericFood(product)) return !product.name.trim();
  return !product.imageUrl || !product.category || !product.brand;
}

function completionScore(product: CompletionProduct) {
  if (product.variantCount > 1) return 100;
  if (product.barcode) return 100;
  if (isGenericFood(product)) return product.name.trim() ? 100 : 0;
  const checks = [Boolean(product.name), Boolean(product.category), Boolean(product.brand), Boolean(product.imageUrl)];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function CatalogueIcon({ name }: { name: "library" | "scan" | "receipt" | "manage" | "pantry" | "price" | "recipe" | "store" }) {
  const common = { fill: "none", height: 20, stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.9, viewBox: "0 0 24 24", width: 20 };
  if (name === "library") return <svg {...common}><path d="M4 6.5 12 3l8 3.5v11L12 21l-8-3.5v-11Z" /><path d="M4 6.5 12 10l8-3.5M12 10v11" /></svg>;
  if (name === "scan") return <svg {...common}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 9v6M11 9v6M14 9v6M16 9v6" /></svg>;
  if (name === "receipt") return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></svg>;
  if (name === "manage") return <svg {...common}><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /><circle cx="8" cy="7" r="1.5" /><circle cx="16" cy="17" r="1.5" /></svg>;
  if (name === "pantry") return <svg {...common}><path d="M5 9h14v11H5zM7 9V5h10v4M9 13h6" /></svg>;
  if (name === "price") return <svg {...common}><path d="m4 4 11.5 0L20 8.5 8.5 20 4 15.5V4Z" /><circle cx="9" cy="9" r="1" /></svg>;
  if (name === "recipe") return <svg {...common}><path d="M7 3h10v18H7zM10 3v4h4V3M10 12h4M10 16h4" /></svg>;
  return <svg {...common}><path d="M4 10h16v10H4zM6 10V6h12v4M8 14h.01M12 14h.01M16 14h.01" /></svg>;
}

function ProductActions() {
  return (
    <div className={styles.heroActions}>
      <Link className={styles.primaryAction} href="/scan"><CatalogueIcon name="scan" />Scan barcode</Link>
      <Link className={styles.secondaryAction} href="/receipts"><CatalogueIcon name="receipt" />Import receipt</Link>
      <Link className={styles.secondaryAction} href="/admin/product-intelligence"><CatalogueIcon name="manage" />Catalogue Manager</Link>
    </div>
  );
}

function ProductCard({ product }: { product: ProductHubListItem }) {
  const href = `/products/${encodeURIComponent(product.slug ?? product.id)}`;
  const { title, receiptName, category } = productDisplay(product);
  const latestPrice = money(product.latestPrice);
  const completeness = completionScore(product);
  const observed = observedLabel(product.latestObservedAt);
  const family = product.variantCount > 1;
  const generic = isGenericFood(product);
  const detailLine = family || generic ? null : product.brand;
  const productImage = product.imageUrl
    ? `/api/products/${encodeURIComponent(product.id)}/image?v=${encodeURIComponent(imageVersion(product.imageUrl))}`
    : null;

  return (
    <article className={styles.card} key={product.id}>
      <div className={styles.thumb}>
        {productImage ? (
          <img alt={title} loading="lazy" src={productImage} />
        ) : <div className={styles.imageFallback} aria-hidden="true"><span>+</span><small>{family ? "Product family" : generic ? "Fresh produce" : "Image pending"}</small></div>}
        <span className={styles.specialImageSlot}>
          {product.latestIsSpecial && !product.priceNeedsSpecificVariant ? <>On special</> : null}
        </span>
        <div className={styles.badges}>
          {product.pantryQuantity > 0 ? <span className={styles.pantryBadge}>In pantry</span> : null}
          {needsDetails(product) ? <span className={styles.attentionBadge}>Needs details</span> : null}
        </div>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTopline}>
          <span>{category ?? (family ? "Product family" : generic ? "Fresh produce" : "Uncategorised")}</span>
          {completeness < 100 ? <span>{completeness}% complete</span> : null}
        </div>
        <div className={styles.priceSummary}>
          <small>Best price</small>
          <strong>{product.priceNeedsSpecificVariant ? "See variants" : latestPrice ?? "Not priced"}</strong>
          <span>{product.priceNeedsSpecificVariant ? "Individual variants have different prices" : product.latestRetailer && product.latestPackSize ? `${product.latestRetailer} · ${product.latestPackSize}` : product.latestRetailer ?? "No retailer linked"}</span>
        </div>
        <h2>{title}</h2>
        {receiptName ? <p className={styles.receiptName}>{receiptName}</p> : null}
        {detailLine ? <p className={styles.brandLine}>{detailLine}</p> : null}
        <div className={styles.meta}>
          {product.recipeCount > 0 ? <span>{product.recipeCount} recipe{product.recipeCount === 1 ? "" : "s"}</span> : null}
          {product.retailerCount > 0 ? <span>{product.retailerCount} retailer{product.retailerCount === 1 ? "" : "s"}</span> : null}
          {family ? <span>{product.variantCount} variants</span> : product.aliasCount > 0 ? <span>{product.aliasCount} alias{product.aliasCount === 1 ? "" : "es"}</span> : null}
          {!family && !generic && !product.imageUrl && product.barcode ? <span>Enrichment pending</span> : null}
          {!family && !generic && !product.imageUrl && !product.barcode ? <span>Image missing</span> : null}
        </div>
        <div className={styles.cardFooter}>
          <span>{product.latestRetailer ? <RetailerLogo compact retailer={product.latestRetailer} /> : "No retailer linked"}</span>
          <small>{observed ? `Checked ${observed}` : "Not checked"}</small>
        </div>
      </div>
      <Link aria-label={`Open ${title}`} className={styles.cardLink} href={href} />
    </article>
  );
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const session = await requireAuthSession();
  const { department: rawDepartment, q = "", shelf: rawShelf, view: rawView } = await searchParams;
  const view = normaliseView(rawView);
  const department = normaliseDepartment(rawDepartment);
  const [allProducts, departmentCounts, retailerPreferences] = await Promise.all([
    getProductHubList(q, department ?? undefined),
    getProductDepartmentCounts(),
    prisma.retailerPreference.findMany({ where: { userId: session.user.id } }),
  ]);
  const catalogueTotal = departmentCounts.reduce((total, departmentCount) => total + departmentCount.productCount, 0);

  const shelfGroups = department ? [...allProducts.reduce((groups, product) => {
    const label = shelfGroupForDepartment(product.shelfLabel, department);
    const current = groups.get(label) ?? [];
    current.push(product);
    groups.set(label, current);
    return groups;
  }, new Map<string, typeof allProducts>())]
    .sort(([left], [right]) => left.startsWith("Other ") ? 1 : right.startsWith("Other ") ? -1 : left.localeCompare(right, "en-AU")) : [];
  const shelf = shelfGroups.some(([label]) => label === rawShelf) ? rawShelf : null;
  const shelfProducts = shelf ? allProducts.filter((product) => shelfGroupForDepartment(product.shelfLabel, department ?? "") === shelf) : allProducts;

  const counts: Record<ProductView, number> = {
    all: shelfProducts.length,
    pantry: shelfProducts.filter((product) => product.pantryQuantity > 0).length,
    priced: shelfProducts.filter((product) => product.latestPrice !== null).length,
    recipes: shelfProducts.filter((product) => product.recipeCount > 0).length,
    "needs-details": shelfProducts.filter(needsDetails).length,
  };

  const products = shelfProducts.filter((product) => {
    if (view === "pantry") return product.pantryQuantity > 0;
    if (view === "priced") return product.latestPrice !== null;
    if (view === "recipes") return product.recipeCount > 0;
    if (view === "needs-details") return needsDetails(product);
    return true;
  });

  const departmentGroups = [...products.reduce((groups, product) => {
    const department = productDepartment(product.category, product.canonicalName ?? product.name);
    const current = groups.get(department) ?? [];
    current.push(product);
    groups.set(department, current);
    return groups;
  }, new Map<string, typeof products>())]
    .sort(([left], [right]) => left.localeCompare(right, "en-AU"));
  const browseDepartments = !q && view === "all" && !department;
  const showProductCardsDirectly = Boolean(q || department || view !== "all");
  const departmentShelfHref = (selectedShelf?: string) => {
    const params = new URLSearchParams({ department: department ?? "" });
    if (q) params.set("q", q);
    if (view !== "all") params.set("view", view);
    if (selectedShelf) params.set("shelf", selectedShelf);
    return `/products?${params.toString()}`;
  };

  const retailerCount = enabledRetailers(retailerPreferences).length;
  const views: Array<{ value: ProductView; label: string }> = [
    { value: "all", label: "All" },
    { value: "pantry", label: "In pantry" },
    { value: "priced", label: "Priced" },
    { value: "recipes", label: "In recipes" },
    { value: "needs-details", label: "Needs attention" },
  ];

  return (
    <main className={styles.page}>
      <section className={styles.summaryGrid} aria-label="Product catalogue summary">
        <article className={styles.summaryCard}><span className={styles.summaryIcon}><CatalogueIcon name="pantry" /></span><div><strong>{counts.pantry}</strong><small>in your pantry</small></div></article>
        <article className={styles.summaryCard}><span className={styles.summaryIcon}><CatalogueIcon name="price" /></span><div><strong>{counts.priced}</strong><small>with price history</small></div></article>
        <article className={styles.summaryCard}><span className={styles.summaryIcon}><CatalogueIcon name="library" /></span><div><strong>{catalogueTotal.toLocaleString("en-AU")}</strong><small>catalogue products</small></div></article>
        <article className={styles.summaryCard}><span className={styles.summaryIcon}><CatalogueIcon name="store" /></span><div><strong>{retailerCount}</strong><small>retailers selected</small></div></article>
      </section>

      <section className={styles.cataloguePanel}>
        <div className={styles.toolbar}>
          <ProductActions />
          <form className={styles.search}>
            {department ? <input name="department" type="hidden" value={department} /> : null}
            {shelf ? <input name="shelf" type="hidden" value={shelf} /> : null}
            {view !== "all" ? <input name="view" type="hidden" value={view} /> : null}
            <div className={styles.searchField}><span aria-hidden="true">?</span><input aria-label="Search products" defaultValue={q} name="q" placeholder="Search name, brand or barcode" type="search" /></div>
            <button className={styles.searchButton} type="submit">Search</button>
          </form>
        </div>

        <nav aria-label="Filter products" className={styles.filters}>
          {views.map((item) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (department) params.set("department", department);
            if (shelf) params.set("shelf", shelf);
            if (item.value !== "all") params.set("view", item.value);
            return <Link className={view === item.value ? styles.filterActive : styles.filter} href={params.size ? `/products?${params.toString()}` : "/products"} key={item.value}><span>{item.label}</span><strong>{counts[item.value]}</strong></Link>;
          })}
        </nav>

        <div aria-label="Products by department" className={departmentStyles.departmentList}>
          {browseDepartments ? departmentCounts.map(({ department: departmentName, productCount }) => {
            const params = new URLSearchParams({ department: departmentName });
            return <Link className={`${departmentStyles.department} ${departmentStyles.departmentLink}`} href={`/products?${params.toString()}`} key={departmentName}>
              <span className={departmentStyles.departmentSummary}>
                <span className={departmentStyles.departmentArtwork}><img alt="" loading="lazy" src={artworkForDepartment(departmentName)} /></span>
                <span className={departmentStyles.departmentHeading}><span className="eyebrow">DEPARTMENT</span><strong>{departmentName}</strong></span>
                <span className={departmentStyles.departmentCount}>{productCount.toLocaleString("en-AU")} products</span>
              </span>
            </Link>;
          }) : department && products.length ? <div className={`${departmentStyles.fullWidth} ${styles.departmentBrowse}`}>
            <nav aria-label={`${department} categories`} className={styles.shelfFilters}>
              <Link className={!shelf ? styles.shelfFilterActive : styles.shelfFilter} href={departmentShelfHref()}><span className={styles.shelfFilterImage}><img alt="" src={artworkForDepartment(department)} /></span><span>All {department}</span><strong>{allProducts.length}</strong></Link>
              {shelfGroups.map(([label, shelfGroupProducts]) => {
                const representative = shelfGroupProducts.find((product) => product.imageUrl) ?? null;
                const image = representative?.imageUrl ? `/api/products/${encodeURIComponent(representative.id)}/image?v=${encodeURIComponent(imageVersion(representative.imageUrl))}` : artworkForDepartment(department);
                return <Link className={shelf === label ? styles.shelfFilterActive : styles.shelfFilter} href={departmentShelfHref(label)} key={label}><span className={styles.shelfFilterImage}><img alt="" loading="lazy" src={image} /></span><span>{label}</span><strong>{shelfGroupProducts.length}</strong></Link>;
              })}
            </nav>
            <div className={styles.grid}>{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          </div> : products.length && showProductCardsDirectly ? <div className={`${departmentStyles.fullWidth} ${styles.grid}`}>{products.map((product) => <ProductCard key={product.id} product={product} />)}</div> : products.length ? departmentGroups.map(([department, departmentProducts]) => (
            <details className={departmentStyles.department} key={department} open={Boolean(department)}>
              <summary className={departmentStyles.departmentSummary}>
                <span className={departmentStyles.departmentArtwork}><img alt="" loading="lazy" src={artworkForDepartment(department)} /></span>
                <span className={departmentStyles.departmentHeading}><span className="eyebrow">DEPARTMENT</span><strong>{department}</strong></span>
                <span className={departmentStyles.departmentCount}>{departmentProducts.length} {departmentProducts.length === 1 ? "family" : "families"}</span>
              </summary>
              <div className={departmentStyles.departmentProducts}>
              {[...departmentProducts.reduce((groups, product) => {
                const shelfGroup = shelfGroupForDepartment(product.shelfLabel, department);
                const current = groups.get(shelfGroup) ?? [];
                current.push(product);
                groups.set(shelfGroup, current);
                return groups;
              }, new Map<string, typeof departmentProducts>())]
                .sort(([left], [right]) => left.startsWith("Other ") ? 1 : right.startsWith("Other ") ? -1 : left.localeCompare(right, "en-AU"))
                .map(([shelfGroup, shelfProducts]) => (
                <details className={departmentStyles.shelfGroup} key={shelfGroup} open={Boolean(q)}>
                  <summary>
                    <h3>{shelfGroup}</h3>
                    <span>{shelfProducts.length} {shelfProducts.length === 1 ? "family" : "families"}</span>
                  </summary>
                  <div className={styles.grid}>
              {shelfProducts.map((product) => <ProductCard key={product.id} product={product} />)}
                  </div>
                </details>
              ))}
              </div>
            </details>
          )) : (
            <div className={styles.empty}>
              <span aria-hidden="true">âŒ•</span><strong>No products found</strong><p>Try another search or filter.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

