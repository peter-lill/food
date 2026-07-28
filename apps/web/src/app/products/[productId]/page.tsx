import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductHubDetail } from "@/lib/products/product-hub.repository";
import styles from "../products.module.css";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ productId: string }>;
};

type ProductKnowledge = {
  overview: string;
  origin?: string;
  uses: string[];
  storage: string[];
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

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").trim();
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
    .map(([unit, quantity]) => {
      const label = unit === "item" && quantity !== 1 ? "items" : unit;
      return `${formatQuantity(quantity)} ${label}`;
    })
    .join(" + ");
}

function knowledgeFor(name: string): ProductKnowledge | null {
  const value = normalise(name);

  if (value.includes("fish oil")) {
    return {
      overview: "Fish oil is an oil derived from oily fish and is commonly sold as liquid or soft-gel capsules. Products vary in their concentrations of EPA and DHA, capsule size, flavouring and serving instructions.",
      origin: "Commercial fish-oil products are generally produced from oily fish or fish-processing material, then purified and concentrated before packaging.",
      uses: ["Dietary supplement", "Source of omega-3 fatty acids", "Available as capsules or liquid"],
      storage: ["Follow the package directions", "Keep tightly closed", "Protect from heat and direct sunlight", "Discard products with an unusual rancid smell"],
    };
  }

  if (value.includes("black bean")) {
    return {
      overview: "Black beans are small dark legumes with a mild, earthy flavour and a creamy texture when cooked. They are sold dried or canned and are commonly used as an affordable source of plant protein and fibre.",
      origin: "Black beans are strongly associated with cuisines of Latin America and the Caribbean and are now grown and eaten in many regions.",
      uses: ["Burrito bowls and tacos", "Soups and stews", "Salads", "Bean patties", "Rice dishes"],
      storage: ["Store dried beans in a cool, dry container", "Refrigerate opened canned beans", "Rinse canned beans before use when appropriate", "Cooked beans can be frozen in portions"],
    };
  }

  if (value.includes("salmon")) {
    return {
      overview: "Salmon is an oily fish with rich, firm flesh. It is commonly sold as fillets or portions and is available fresh, frozen, smoked and canned.",
      origin: "Retail salmon may be farmed or wild caught and can come from different species and regions. Check the specific package for country-of-origin and production details.",
      uses: ["Pan-frying", "Baking", "Grilling", "Rice bowls", "Salads", "Pasta"],
      storage: ["Keep chilled and use by the package date", "Freeze promptly when not using fresh", "Thaw in the refrigerator", "Keep cooked fish refrigerated"],
    };
  }

  if (value.includes("sweet potato")) {
    return {
      overview: "Sweet potatoes are starchy root vegetables with naturally sweet flesh. They are commonly sold loose by weight and do not normally have a brand, barcode or fixed pack size.",
      uses: ["Roasting", "Mashing", "Air frying", "Soups and curries", "Salads and bowls"],
      storage: ["Keep in a cool, dark and ventilated place", "Do not refrigerate raw sweet potatoes", "Use promptly if the skin becomes soft or damaged"],
    };
  }

  if (value === "carrot" || value.includes("carrots")) {
    return {
      overview: "Carrots are crisp root vegetables with a mild sweetness. They can be eaten raw or cooked and are sold loose, bagged, whole, baby-cut, frozen or canned.",
      uses: ["Salads and slaws", "Roasting", "Soups and stews", "Stir-fries", "Grating into baking"],
      storage: ["Keep refrigerated", "Remove leafy tops before long storage", "Store dry in a produce drawer or container"],
    };
  }

  if (value === "lemon" || value.includes("lemons")) {
    return {
      overview: "Lemons are acidic citrus fruit used for their juice, zest and rind. The whole fruit, juice and rind can serve different purposes in recipes even though they come from the same ingredient.",
      uses: ["Juice in dressings and marinades", "Zest in baking and sauces", "Serving with seafood", "Adding acidity without extra salt"],
      storage: ["Store at room temperature for short use", "Refrigerate for longer storage", "Freeze juice or zest in portions"],
    };
  }

  return null;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { productId } = await params;
  const product = await getProductHubDetail(decodeURIComponent(productId));
  if (!product) notFound();

  const displayName = product.name;
  const canonicalName = product.canonicalName && normalise(product.canonicalName) !== normalise(product.name)
    ? product.canonicalName
    : null;
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
      <Link className={`secondary-button ${styles.backLink}`} href="/products">
        ← Product Hub
      </Link>

      <section className={styles.detailHero}>
        <div className={styles.identity}>
          <div className={styles.identityLayout}>
            <div className={styles.productVisual}>
              <span aria-hidden="true">◈</span>
              <img alt={displayName} src={productImage} />
            </div>
            <div>
              <p className="eyebrow">{product.category ?? canonicalName ?? "PRODUCT"}</p>
              <h1 className="page-title">{displayName}</h1>
              {canonicalName ? <p><strong>Product family:</strong> {canonicalName}</p> : null}
              {product.brand ? <p><strong>{product.brand}</strong></p> : null}
              <p className="subtle">
                {product.description ?? knowledge?.overview ?? "A product record shared across Pantry, Shopping, Recipes, Receipts and price history."}
              </p>
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
            <div className={styles.metric}>
              <small>Latest price</small>
              <strong>{latestPrice ? money(latestPrice.price) : "—"}</strong>
              <small>{latestPrice?.retailer ?? "No observation"}</small>
            </div>
            <div className={styles.metric}>
              <small>Pantry quantity</small>
              <strong>{pantryQuantity}</strong>
              <small>{product.inventory.length ? `${product.inventory.length} stock record${product.inventory.length === 1 ? "" : "s"}` : "Not stocked"}</small>
            </div>
            <div className={styles.metric}>
              <small>Known names</small>
              <strong>{product.aliases.length + (canonicalName ? 1 : 0)}</strong>
              <small>Aliases and family</small>
            </div>
            <div className={styles.metric}>
              <small>Price records</small>
              <strong>{product.priceObservations.length}</strong>
              <small>Latest 100 retained</small>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.sections}>
        {knowledge ? (
          <article className={styles.panel}>
            <h2>About {canonicalName ?? displayName}</h2>
            <p className="subtle">{knowledge.overview}</p>
            {knowledge.origin ? <><h3>Origin and production</h3><p className="subtle">{knowledge.origin}</p></> : null}
          </article>
        ) : null}

        {knowledge ? (
          <article className={styles.panel}>
            <h2>Common uses</h2>
            <div className={styles.tags}>{knowledge.uses.map((use) => <span key={use}>{use}</span>)}</div>
            <h3>Storage</h3>
            <ul className={styles.list}>{knowledge.storage.map((tip) => <li className={styles.listItem} key={tip}><span>{tip}</span></li>)}</ul>
          </article>
        ) : null}

        <article className={styles.panel}>
          <h2>Product identity</h2>
          <ul className={styles.list}>
            <li className={styles.listItem}><span>Detailed name</span><strong>{displayName}</strong></li>
            {canonicalName ? <li className={styles.listItem}><span>Product family</span><strong>{canonicalName}</strong></li> : null}
            {product.brand ? <li className={styles.listItem}><span>Brand</span><strong>{product.brand}</strong></li> : null}
            {product.packSize ? <li className={styles.listItem}><span>Pack size</span><strong>{product.packSize}</strong></li> : null}
            {product.barcode ? <li className={styles.listItem}><span>Barcode</span><strong>{product.barcode}</strong></li> : null}
            {product.category ? <li className={styles.listItem}><span>Category</span><strong>{product.category}</strong></li> : null}
          </ul>
        </article>

        {product.storeProducts.length ? (
          <article className={styles.panel}>
            <h2>Current retailer listings</h2>
            <ul className={styles.list}>
              {product.storeProducts.map((listing) => (
                <li className={styles.listItem} key={listing.id}>
                  <div className={styles.listingIdentity}>
                    <div className={styles.listingImage}>
                      {listing.imageUrl ? <img alt="" src={listing.imageUrl} /> : <span>◈</span>}
                    </div>
                    <div>
                      <strong>{listing.retailer}</strong>
                      <small>{listing.retailerProductName}</small>
                    </div>
                  </div>
                  <div>
                    <strong>{listing.packSize ?? "—"}</strong>
                    <small>{listing.aisle ?? date(listing.lastSeenAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        {product.priceObservations.length ? (
          <article className={styles.panel}>
            <h2>Recent price history</h2>
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
          </article>
        ) : null}

        {product.recipes.length ? (
          <article className={styles.panel}>
            <h2>Used in recipes</h2>
            <ul className={styles.list}>
              {product.recipes.map((recipe) => (
                <li className={styles.listItem} key={recipe.id}>
                  <strong>{recipe.name}</strong>
                  <small>{recipe.sourceName ?? "Food"}</small>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        {product.inventory.length ? (
          <article className={styles.panel}>
            <h2>Pantry stock</h2>
            <ul className={styles.list}>
              {product.inventory.map((item) => (
                <li className={styles.listItem} key={item.id}>
                  <div>
                    <strong>{item.location}</strong>
                    <small>Expires {date(item.expiresAt)}</small>
                  </div>
                  <strong>{formatQuantity(item.quantity)} {item.unit}</strong>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        {nutrition.length ? (
          <article className={styles.panel}>
            <h2>Nutrition</h2>
            <div className={styles.metricGrid}>
              {nutrition.map(([label, value]) => (
                <div className={styles.metric} key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {product.aliases.length || product.dietaryTags.length || product.allergens.length ? (
          <article className={styles.panel}>
            <h2>Recognised names and dietary data</h2>
            {product.aliases.length ? <div className={styles.tags}>{product.aliases.map((alias) => <span key={alias.id}>{alias.alias}</span>)}</div> : null}
            {product.dietaryTags.length ? <div className={styles.tags}>{product.dietaryTags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
            {product.allergens.length ? <p className="subtle">Allergens: {product.allergens.join(", ")}</p> : null}
          </article>
        ) : null}
      </section>
    </div>
  );
}
