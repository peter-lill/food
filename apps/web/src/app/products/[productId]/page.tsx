import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductHubDetail } from "@/lib/products/product-hub.repository";
import styles from "../products.module.css";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ productId: string }>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function date(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(value)
    : "Not recorded";
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { productId } = await params;
  const product = await getProductHubDetail(decodeURIComponent(productId));
  if (!product) notFound();

  const displayName = product.canonicalName ?? product.name;
  const latestPrice = product.priceObservations[0] ?? null;
  const pantryQuantity = product.inventory.reduce((total, item) => total + item.quantity, 0);
  const retailerCount = new Set([
    ...product.storeProducts.map((listing) => listing.retailer),
    ...product.priceObservations.map((observation) => observation.retailer),
  ]).size;

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
      <Link className={`secondary-button ${styles.backLink}`} href="/products">
        ← Product Hub
      </Link>

      <section className={styles.detailHero}>
        <div className={styles.identity}>
          <p className="eyebrow">{product.category ?? "CANONICAL PRODUCT"}</p>
          <h1 className="page-title">{displayName}</h1>
          {product.brand ? <p><strong>{product.brand}</strong></p> : null}
          <p className="subtle">
            {product.description ?? "A shared Food product used across recipes, pantry, shopping and price history."}
          </p>
          <div className={styles.identityMeta}>
            {product.packSize ? <span>{product.packSize}</span> : null}
            {product.barcode ? <span>Barcode {product.barcode}</span> : null}
            <span>{product.recipes.length} recipe link{product.recipes.length === 1 ? "" : "s"}</span>
            <span>{retailerCount} retailer{retailerCount === 1 ? "" : "s"}</span>
          </div>
        </div>

        <aside className={styles.panel}>
          <p className="eyebrow">AT A GLANCE</p>
          <div className={styles.metricGrid}>
            <div className={styles.metric}>
              <small>Latest price</small>
              <strong>{latestPrice ? money(latestPrice.price) : "—"}</strong>
              <small>{latestPrice?.retailer ?? "No observation"}</small>
            </div>
            <div className={styles.metric}>
              <small>Pantry quantity</small>
              <strong>{pantryQuantity || "—"}</strong>
              <small>{product.inventory.length ? `${product.inventory.length} stock record${product.inventory.length === 1 ? "" : "s"}` : "Not stocked"}</small>
            </div>
            <div className={styles.metric}>
              <small>Aliases</small>
              <strong>{product.aliases.length}</strong>
              <small>Search names</small>
            </div>
            <div className={styles.metric}>
              <small>Price observations</small>
              <strong>{product.priceObservations.length}</strong>
              <small>Latest 100 shown</small>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.sections}>
        <article className={styles.panel}>
          <h2>Current retailer listings</h2>
          {product.storeProducts.length ? (
            <ul className={styles.list}>
              {product.storeProducts.map((listing) => (
                <li className={styles.listItem} key={listing.id}>
                  <div>
                    <strong>{listing.retailer}</strong>
                    <small>{listing.retailerProductName}</small>
                  </div>
                  <div>
                    <strong>{listing.packSize ?? "—"}</strong>
                    <small>{listing.aisle ?? date(listing.lastSeenAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="subtle">No store listings have been linked yet.</p>}
        </article>

        <article className={styles.panel}>
          <h2>Recent price history</h2>
          {product.priceObservations.length ? (
            <ul className={styles.list}>
              {product.priceObservations.slice(0, 12).map((observation) => (
                <li className={styles.listItem} key={observation.id}>
                  <div>
                    <strong>{observation.retailer}</strong>
                    <small>{observation.source}{observation.isSpecial ? " · special" : ""}</small>
                  </div>
                  <div>
                    <strong>{money(observation.price)}</strong>
                    <small>{date(observation.observedAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="subtle">No price observations have been recorded yet.</p>}
        </article>

        <article className={styles.panel}>
          <h2>Used in recipes</h2>
          {product.recipes.length ? (
            <ul className={styles.list}>
              {product.recipes.map((recipe) => (
                <li className={styles.listItem} key={recipe.id}>
                  <strong>{recipe.name}</strong>
                  <small>{recipe.sourceName ?? "Food"}</small>
                </li>
              ))}
            </ul>
          ) : <p className="subtle">No recipes are linked to this product yet.</p>}
        </article>

        <article className={styles.panel}>
          <h2>Pantry stock</h2>
          {product.inventory.length ? (
            <ul className={styles.list}>
              {product.inventory.map((item) => (
                <li className={styles.listItem} key={item.id}>
                  <div>
                    <strong>{item.location}</strong>
                    <small>Expires {date(item.expiresAt)}</small>
                  </div>
                  <strong>{item.quantity} {item.unit}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="subtle">This product is not currently in the pantry.</p>}
        </article>

        <article className={styles.panel}>
          <h2>Nutrition</h2>
          {nutrition.length ? (
            <div className={styles.metricGrid}>
              {nutrition.map(([label, value]) => (
                <div className={styles.metric} key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          ) : <p className="subtle">Nutrition has not been enriched yet.</p>}
        </article>

        <article className={styles.panel}>
          <h2>Aliases and dietary data</h2>
          {product.aliases.length ? (
            <div className={styles.tags}>
              {product.aliases.map((alias) => <span key={alias.id}>{alias.alias}</span>)}
            </div>
          ) : <p className="subtle">No aliases have been recorded yet.</p>}
          {product.dietaryTags.length ? <div className={styles.tags}>{product.dietaryTags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
          {product.allergens.length ? <p className="subtle">Allergens: {product.allergens.join(", ")}</p> : null}
        </article>
      </section>
    </div>
  );
}
