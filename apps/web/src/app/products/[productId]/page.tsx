import Link from "next/link";
import { notFound } from "next/navigation";
import { enrichProductKnowledge } from "@/lib/product-intelligence/barcode-enrichment";
import { getProductHubDetail } from "@/lib/products/product-hub.repository";
import styles from "../products.module.css";

export const dynamic = "force-dynamic";

type ProductPageProps = { params: Promise<{ productId: string }> };
type ProductKnowledge = { overview: string; origin?: string; uses: string[]; storage: string[] };

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function date(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(value) : "Not recorded";
}

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function collapseRepeatedPhrase(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  for (let size = 1; size <= Math.floor(words.length / 2); size += 1) {
    if (words.length % size !== 0) continue;
    const phrase = words.slice(0, size).join(" ");
    const repeated = Array.from({ length: words.length / size }, () => phrase).join(" ");
    if (normalise(repeated) === normalise(value)) return phrase;
  }
  return value.trim();
}

function cleanFamilyName(value: string | null, productName: string) {
  if (!value) return null;
  const cleaned = collapseRepeatedPhrase(value);
  return normalise(cleaned) === normalise(productName) ? null : cleaned;
}

function cleanCategoryName(value: string | null, productName: string, familyName: string | null) {
  if (!value) return null;
  const cleaned = collapseRepeatedPhrase(value);
  const normalised = normalise(cleaned);
  if (!normalised || normalised === normalise(productName)) return null;
  if (familyName && normalised === normalise(familyName)) return null;
  return cleaned;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(value);
}

function pantryQuantityLabel(inventory: Array<{ quantity: number; unit: string }>) {
  if (!inventory.length) return "—";
  const totals = new Map<string, number>();
  for (const item of inventory) {
    const unit = item.unit.trim() || "item";
    totals.set(unit, (totals.get(unit) ?? 0) + item.quantity);
  }
  return [...totals.entries()]
    .map(([unit, quantity]) => `${formatQuantity(quantity)} ${unit === "item" && quantity !== 1 ? "items" : unit}`)
    .join(" + ");
}

function knowledgeFor(name: string): ProductKnowledge | null {
  const value = normalise(name);
  if (value.includes("fish oil")) return {
    overview: "Fish oil is an oil derived from oily fish and is commonly sold as liquid or soft-gel capsules.",
    origin: "Commercial fish-oil products are generally purified and concentrated before packaging.",
    uses: ["Dietary supplement", "Source of omega-3 fatty acids", "Available as capsules or liquid"],
    storage: ["Follow the package directions", "Keep tightly closed", "Protect from heat and direct sunlight"],
  };
  if (value.includes("black bean")) return {
    overview: "Black beans are mild, earthy legumes with a creamy texture when cooked.",
    uses: ["Burrito bowls and tacos", "Soups and stews", "Salads", "Rice dishes"],
    storage: ["Store dried beans in a cool, dry container", "Refrigerate opened canned beans"],
  };
  if (value.includes("salmon")) return {
    overview: "Salmon is an oily fish with rich, firm flesh and is sold fresh, frozen, smoked and canned.",
    uses: ["Pan-frying", "Baking", "Grilling", "Rice bowls", "Salads"],
    storage: ["Keep chilled", "Freeze promptly when not using fresh", "Thaw in the refrigerator"],
  };
  if (value.includes("sweet potato")) return {
    overview: "Sweet potatoes are naturally sweet root vegetables commonly sold loose by weight.",
    uses: ["Roasting", "Mashing", "Air frying", "Soups and curries"],
    storage: ["Keep in a cool, dark and ventilated place", "Do not refrigerate raw sweet potatoes"],
  };
  if (value.includes("broccoli")) return {
    overview: "Broccoli is a green brassica vegetable commonly eaten steamed, roasted, stir-fried or raw.",
    uses: ["Steaming", "Roasting", "Stir-fries", "Soups", "Salads"],
    storage: ["Keep refrigerated", "Store dry in the crisper drawer", "Use promptly for best quality"],
  };
  if (value === "carrot" || value.includes("carrots")) return {
    overview: "Carrots are crisp root vegetables with a mild sweetness.",
    uses: ["Salads and slaws", "Roasting", "Soups and stews", "Stir-fries"],
    storage: ["Keep refrigerated", "Store dry in a produce drawer or container"],
  };
  if (value === "lemon" || value.includes("lemons")) return {
    overview: "Lemons are acidic citrus fruit used for their juice, zest and rind.",
    uses: ["Dressings and marinades", "Baking and sauces", "Serving with seafood"],
    storage: ["Store at room temperature for short use", "Refrigerate for longer storage"],
  };
  return null;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { productId } = await params;
  const decodedProductId = decodeURIComponent(productId);
  await enrichProductKnowledge(decodedProductId);
  const product = await getProductHubDetail(decodedProductId);
  if (!product) notFound();

  const displayName = collapseRepeatedPhrase(product.name);
  const canonicalName = cleanFamilyName(product.canonicalName, displayName);
  const categoryName = cleanCategoryName(product.category, displayName, canonicalName);
  const knowledge = knowledgeFor(canonicalName ?? displayName);
  const latestPrice = product.priceObservations[0] ?? null;
  const pantryQuantity = pantryQuantityLabel(product.inventory);
  const retailerCount = new Set([
    ...product.storeProducts.map((listing) => listing.retailer),
    ...product.priceObservations.map((observation) => observation.retailer),
  ]).size;
  const productImage = `/api/products/${encodeURIComponent(product.id)}/image`;
  const nutrition = [
    ["Energy", product.calories === null ? null : `${Math.round(product.calories)} kcal`],
    ["Protein", product.proteinGrams === null ? null : `${product.proteinGrams} g`],
    ["Carbohydrate", product.carbsGrams === null ? null : `${product.carbsGrams} g`],
    ["Fat", product.fatGrams === null ? null : `${product.fatGrams} g`],
    ["Saturated fat", product.saturatedFatGrams === null ? null : `${product.saturatedFatGrams} g`],
    ["Fibre", product.fibreGrams === null ? null : `${product.fibreGrams} g`],
    ["Sugar", product.sugarGrams === null ? null : `${product.sugarGrams} g`],
    ["Sodium", product.sodiumMg === null ? null : `${Math.round(product.sodiumMg)} mg`],
  ].filter((entry): entry is [string, string] => entry[1] !== null);

  return (
    <div className={styles.page}>
      <Link className={`secondary-button ${styles.backLink}`} href="/products">← Product Hub</Link>
      <section className={styles.detailHero}>
        <div className={styles.identity}>
          <div className={styles.identityLayout}>
            <div className={styles.productVisual}><img alt={displayName} src={productImage} /></div>
            <div>
              <p className="eyebrow">{categoryName ?? "PRODUCT"}</p>
              <h1 className="page-title">{displayName}</h1>
              {canonicalName ? <p><strong>Product family:</strong> {canonicalName}</p> : null}
              {product.brand ? <p><strong>{product.brand}</strong></p> : null}
              <p className="subtle">{product.description ?? knowledge?.overview ?? "A product record shared across Pantry, Shopping, Recipes, Receipts and price history."}</p>
              <div className={styles.identityMeta}>
                {product.packSize ? <span>{product.packSize}</span> : null}
                {product.barcode ? <span>Barcode {product.barcode}</span> : null}
                {product.recipes.length ? <span>{product.recipes.length} recipe link{product.recipes.length === 1 ? "" : "s"}</span> : null}
                {retailerCount ? <span>{retailerCount} retailer{retailerCount === 1 ? "" : "s"}</span> : null}
              </div>
            </div>
          </div>
        </div>
        <aside className={styles.panel}>
          <p className="eyebrow">YOUR PRODUCT</p>
          <div className={styles.metricGrid}>
            <div className={styles.metric}><small>Latest price</small><strong>{latestPrice ? money(latestPrice.price) : "—"}</strong><small>{latestPrice?.retailer ?? "No observation"}</small></div>
            <div className={styles.metric}><small>Pantry quantity</small><strong>{pantryQuantity}</strong><small>{product.inventory.length ? `${product.inventory.length} stock record${product.inventory.length === 1 ? "" : "s"}` : "Not stocked"}</small></div>
            <div className={styles.metric}><small>Known names</small><strong>{product.aliases.length + (canonicalName ? 1 : 0)}</strong><small>Aliases and family</small></div>
            <div className={styles.metric}><small>Price records</small><strong>{product.priceObservations.length}</strong><small>Latest 100 retained</small></div>
          </div>
        </aside>
      </section>
      <section className={styles.sections}>
        {knowledge ? <article className={styles.panel}><h2>About {canonicalName ?? displayName}</h2><p className="subtle">{knowledge.overview}</p>{knowledge.origin ? <><h3>Origin and production</h3><p className="subtle">{knowledge.origin}</p></> : null}</article> : null}
        {knowledge ? <article className={styles.panel}><h2>Common uses</h2><div className={styles.tags}>{knowledge.uses.map((use) => <span key={use}>{use}</span>)}</div><h3>Storage</h3><ul className={styles.list}>{knowledge.storage.map((tip) => <li className={styles.listItem} key={tip}><span>{tip}</span></li>)}</ul></article> : null}
        <article className={styles.panel}>
          <h2>Product identity</h2>
          <ul className={styles.list}>
            <li className={styles.listItem}><span>Detailed name</span><strong>{displayName}</strong></li>
            {canonicalName ? <li className={styles.listItem}><span>Product family</span><strong>{canonicalName}</strong></li> : null}
            {product.brand ? <li className={styles.listItem}><span>Brand</span><strong>{product.brand}</strong></li> : null}
            {product.packSize ? <li className={styles.listItem}><span>Pack size</span><strong>{product.packSize}</strong></li> : null}
            {product.barcode ? <li className={styles.listItem}><span>Barcode</span><strong>{product.barcode}</strong></li> : null}
            {categoryName ? <li className={styles.listItem}><span>Category</span><strong>{categoryName}</strong></li> : null}
          </ul>
        </article>
        {product.storeProducts.length ? <article className={styles.panel}><h2>Current retailer listings</h2><ul className={styles.list}>{product.storeProducts.map((listing) => <li className={styles.listItem} key={listing.id}><div className={styles.listingIdentity}><div className={styles.listingImage}>{listing.imageUrl ? <img alt="" src={listing.imageUrl} /> : <span>◈</span>}</div><div><strong>{listing.retailer}</strong><small>{listing.retailerProductName}</small></div></div><div><strong>{listing.packSize ?? "—"}</strong><small>{listing.aisle ?? date(listing.lastSeenAt)}</small></div></li>)}</ul></article> : null}
        {product.priceObservations.length ? <article className={styles.panel}><h2>Recent price history</h2><ul className={styles.list}>{product.priceObservations.slice(0, 12).map((observation) => <li className={styles.listItem} key={observation.id}><div><strong>{observation.retailer}</strong><small>{observation.source}{observation.isSpecial ? " · special" : ""}</small></div><div><strong>{money(observation.price)}</strong><small>{date(observation.observedAt)}</small></div></li>)}</ul></article> : null}
        {product.recipes.length ? <article className={styles.panel}><h2>Used in recipes</h2><ul className={styles.list}>{product.recipes.map((recipe) => <li className={styles.listItem} key={recipe.id}><strong>{recipe.name}</strong><small>{recipe.sourceName ?? "Recipe"}</small></li>)}</ul></article> : null}
        {nutrition.length ? <article className={styles.panel}><h2>Nutrition</h2><ul className={styles.list}>{nutrition.map(([label, value]) => <li className={styles.listItem} key={label}><span>{label}</span><strong>{value}</strong></li>)}</ul></article> : null}
      </section>
    </div>
  );
}
