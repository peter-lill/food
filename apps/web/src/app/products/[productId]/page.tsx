import Link from "next/link";
import { notFound } from "next/navigation";
import { Ean13Barcode } from "@/components/products/Ean13Barcode";
import { ProductImagePanel } from "@/components/products/ProductImagePanel";
import { ProductImageWithFallback } from "@/components/products/ProductImageWithFallback";
import { ProductMergePanel } from "@/components/products/ProductMergePanel";
import { enrichProductKnowledge } from "@/lib/product-intelligence/barcode-enrichment";
import { productDepartment, supermarketDepartments } from "@/lib/products/product-category";
import { updateProductDetails } from "@/lib/products/product-detail.actions";
import { getProductHubDetail } from "@/lib/products/product-hub.repository";
import styles from "../products.module.css";

export const dynamic = "force-dynamic";

type ProductPageProps = { params: Promise<{ productId: string }>; searchParams: Promise<{ specific?: string }> };
type ProductKnowledge = { overview: string; origin?: string; uses: string[]; storage: string[] };
type NutritionRow = { label: string; per100: string; perServing: string | undefined; sub?: boolean };

const servingUnits = ["g", "mL", "item", "slice", "piece", "tablet", "capsule"] as const;

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function date(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(value) : "Not recorded";
}

function oneDecimal(value: number) {
  return new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function displayAllergen(value: string) {
  return value
    .replace(/^[a-z]{2}:/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-AU"));
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
  if (normalise(cleaned) === normalise(productName)) return null;
  if (/\bb00\s*(?:g|gram)?\b/i.test(cleaned) && !/\bb00\s*(?:g|gram)?\b/i.test(productName)) return null;
  if (normalise(cleaned).includes(normalise(productName))) return null;
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
  if (value.includes("fish oil")) return { overview: "Fish oil is an oil derived from oily fish and is commonly sold as liquid or soft-gel capsules.", origin: "Commercial fish-oil products are generally purified and concentrated before packaging.", uses: ["Dietary supplement", "Source of omega-3 fatty acids", "Available as capsules or liquid"], storage: ["Follow the package directions", "Keep tightly closed", "Protect from heat and direct sunlight"] };
  if (value.includes("black bean")) return { overview: "Black beans are mild, earthy legumes with a creamy texture when cooked.", uses: ["Burrito bowls and tacos", "Soups and stews", "Salads", "Rice dishes"], storage: ["Store dried beans in a cool, dry container", "Refrigerate opened canned beans"] };
  if (value.includes("salmon")) return { overview: "Salmon is an oily fish with rich, firm flesh and is sold fresh, frozen, smoked and canned.", uses: ["Pan-frying", "Baking", "Grilling", "Rice bowls", "Salads"], storage: ["Keep chilled", "Freeze promptly when not using fresh", "Thaw in the refrigerator"] };
  if (value.includes("sweet potato")) return { overview: "Sweet potatoes are naturally sweet root vegetables commonly sold loose by weight.", uses: ["Roasting", "Mashing", "Air frying", "Soups and curries"], storage: ["Keep in a cool, dark and ventilated place", "Do not refrigerate raw sweet potatoes"] };
  if (value.includes("broccoli")) return { overview: "Broccoli is a green brassica vegetable commonly eaten steamed, roasted, stir-fried or raw.", uses: ["Steaming", "Roasting", "Stir-fries", "Soups", "Salads"], storage: ["Keep refrigerated", "Store dry in the crisper drawer", "Use promptly for best quality"] };
  if (value === "carrot" || value.includes("carrots")) return { overview: "Carrots are crisp root vegetables with a mild sweetness.", uses: ["Salads and slaws", "Roasting", "Soups and stews", "Stir-fries"], storage: ["Keep refrigerated", "Store dry in a produce drawer or container"] };
  if (value === "lemon" || value.includes("lemons")) return { overview: "Lemons are acidic citrus fruit used for their juice, zest and rind.", uses: ["Dressings and marinades", "Baking and sauces", "Serving with seafood"], storage: ["Store at room temperature for short use", "Refrigerate for longer storage"] };
  return null;
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { productId } = await params;
  const { specific } = await searchParams;
  const decodedProductId = decodeURIComponent(productId);
  await enrichProductKnowledge(decodedProductId);
  const product = await getProductHubDetail(decodedProductId, { specific: specific === "1" });
  if (!product) notFound();
  const isGenericProduct = !product.brand && !product.barcode && product.storeProducts.length === 0;

  const rawDisplayName = collapseRepeatedPhrase(product.name);
  const genericFamily = !product.brand && !product.barcode && product.canonicalName
    ? collapseRepeatedPhrase(product.canonicalName)
    : null;
  const displayName = genericFamily ?? rawDisplayName;
  const canonicalName = cleanFamilyName(product.canonicalName, displayName);
  const department = productDepartment(product.category, canonicalName ?? displayName);
  const barcodeRequired = !isGenericProduct && product.productType !== "GENERIC_PRODUCE";
  const knowledge = knowledgeFor(canonicalName ?? displayName);
  const description = product.description ?? knowledge?.overview ?? null;
  const latestPrice = product.priceObservations[0] ?? null;
  const latestPriceByRetailer = new Map<string, (typeof product.priceObservations)[number]>();
  for (const observation of product.priceObservations) {
    if (!latestPriceByRetailer.has(observation.retailer)) latestPriceByRetailer.set(observation.retailer, observation);
  }
  const pantryQuantity = pantryQuantityLabel(product.inventory);
  const retailerCount = new Set([
    ...product.storeProducts.map((listing) => listing.retailer),
    ...product.priceObservations.map((observation) => observation.retailer),
  ]).size;
  const servingFactor = product.servingQuantity !== null && ["g", "mL"].includes(product.servingUnit ?? "")
    ? product.servingQuantity / 100
    : null;
  const servingValue = (value: number, unit: "kJ" | "g" | "mg") => servingFactor === null ? undefined : `${oneDecimal(value * servingFactor)} ${unit}`;
  const nutrition = [
    product.calories === null ? null : { label: "Energy", per100: `${oneDecimal(product.calories * 4.184)} kJ`, perServing: servingValue(product.calories * 4.184, "kJ") },
    product.proteinGrams === null ? null : { label: "Protein", per100: `${oneDecimal(product.proteinGrams)} g`, perServing: servingValue(product.proteinGrams, "g") },
    product.fatGrams === null ? null : { label: "Fat, total", per100: `${oneDecimal(product.fatGrams)} g`, perServing: servingValue(product.fatGrams, "g") },
    product.saturatedFatGrams === null ? null : { label: "– saturated", per100: `${oneDecimal(product.saturatedFatGrams)} g`, perServing: servingValue(product.saturatedFatGrams, "g"), sub: true },
    product.carbsGrams === null ? null : { label: "Carbohydrate", per100: `${oneDecimal(product.carbsGrams)} g`, perServing: servingValue(product.carbsGrams, "g") },
    product.sugarGrams === null ? null : { label: "– sugars", per100: `${oneDecimal(product.sugarGrams)} g`, perServing: servingValue(product.sugarGrams, "g"), sub: true },
    product.fibreGrams === null ? null : { label: "Dietary fibre", per100: `${oneDecimal(product.fibreGrams)} g`, perServing: servingValue(product.fibreGrams, "g") },
    product.sodiumMg === null ? null : { label: "Sodium", per100: `${oneDecimal(product.sodiumMg)} mg`, perServing: servingValue(product.sodiumMg, "mg") },
  ].filter((entry): entry is NutritionRow => entry !== null);
  const hasPerServing = nutrition.some((row) => row.perServing !== undefined);
  const editAction = updateProductDetails.bind(null, product.id);

  return (
    <div className={styles.page}>
      <Link className={`secondary-button ${styles.backLink}`} href="/products">← Product Hub</Link>
      <section className={`${styles.detailHero} ${isGenericProduct ? styles.genericDetailHero : ""}`}>
        <div className={styles.identity}>
          <div className={styles.identityLayout}>
            <div className={styles.productVisual}>
              <ProductImageWithFallback alt={displayName} imageVersion={product.imageUrl} productId={product.id} />
            </div>
            <div>
              <p className="eyebrow">{department ?? "PRODUCT"}</p>
              <h1 className="page-title">{displayName}</h1>
              {canonicalName ? <p><strong>Product family:</strong> {canonicalName}</p> : null}
              {product.brand ? <p><strong>{product.brand}</strong></p> : null}
              {description ? <p className="subtle">{description}</p> : null}
              <div className={styles.identityMeta}>
                {product.packSize ? <span>{product.packSize}</span> : null}
                {product.barcode ? <span>Barcode {product.barcode}</span> : barcodeRequired ? <span>Barcode not known</span> : null}
                {latestPrice?.isSpecial ? <span>On special at {latestPrice.retailer}</span> : null}
                {product.recipes.length ? <span>{product.recipes.length} recipe link{product.recipes.length === 1 ? "" : "s"}</span> : null}
                {retailerCount ? <span>{retailerCount} retailer{retailerCount === 1 ? "" : "s"}</span> : null}
              </div>
            </div>
          </div>
        </div>
        {!isGenericProduct ? <aside className={styles.panel}>
          <p className="eyebrow">YOUR PRODUCT</p>
          <div className={styles.metricGrid}>
            <div className={styles.metric}><small>{latestPrice?.isSpecial ? "Special price" : "Latest price"}</small><strong>{latestPrice ? money(latestPrice.price) : "—"}</strong><small>{latestPrice ? `${latestPrice.isSpecial ? "On special" : "Regular price"} · ${latestPrice.retailer} · ${date(latestPrice.observedAt)}` : "No observation"}</small></div>
            <div className={styles.metric}><small>Pantry quantity</small><strong>{pantryQuantity}</strong><small>{product.inventory.length ? `${product.inventory.length} stock record${product.inventory.length === 1 ? "" : "s"}` : "Not stocked"}</small></div>
            <div className={styles.metric}><small>Known names</small><strong>{product.aliases.length + (canonicalName ? 1 : 0)}</strong><small>Aliases and family</small></div>
            <div className={styles.metric}><small>Price records</small><strong>{product.priceObservations.length}</strong><small>Latest 100 retained</small></div>
          </div>
        </aside> : null}
      </section>

      <section className={styles.sections}>
        <ProductImagePanel productId={product.id} productName={displayName} hasImage={Boolean(product.imageUrl)} showLabelDetails={!isGenericProduct} />

        {product.variants.length ? (
          <article className={styles.panel}>
            <p className="eyebrow">SPECIFIC PRODUCTS</p>
            <h2>Brands and products</h2>
            <p className="subtle">Choose a specific product for its retailer, price, image and package details.</p>
            <ul className={styles.list}>
              {product.variants.map((variant) => (
                <li className={styles.listItem} key={variant.id}>
                  <div className={styles.listingIdentity}>
                    <div className={styles.listingImage}><ProductImageWithFallback alt={variant.name} imageVersion={variant.imageUrl} productId={variant.id} /></div>
                    <div><Link href={`/products/${encodeURIComponent(variant.slug ?? variant.id)}?specific=1`}><strong>{variant.name}</strong></Link><small>{[variant.brand, variant.packSize].filter(Boolean).join(" Â· ") || "Generic variety"}</small></div>
                  </div>
                  <div><strong>{variant.latestPrice === null ? "Not priced" : money(variant.latestPrice)}</strong><small>{variant.latestRetailer ?? (variant.barcode ? `Barcode ${variant.barcode}` : "No retailer linked")}</small></div>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        {product.barcode ? (
          <article className={`${styles.panel} ${styles.barcodePanel}`}>
            <div><p className="eyebrow">GTIN / EAN</p><h2>Product barcode</h2><p className="subtle">Use this barcode to identify the exact packaged product across retailers and product databases.</p></div>
            <div className={styles.barcodeGraphic}><Ean13Barcode value={product.barcode} /></div>
          </article>
        ) : barcodeRequired ? (
          <article className={`${styles.panel} ${styles.barcodePanel}`}><div><p className="eyebrow">GTIN / EAN</p><h2>Barcode not known</h2><p className="subtle">Food will continue checking trusted retailer and barcode sources for this product.</p></div></article>
        ) : null}

        {!isGenericProduct ? <>
        <article className={styles.panel}>
          <details>
            <summary><strong>Edit product details</strong></summary>
            <form action={editAction} className="pantry-form compact">
              <label className="field"><span>Product name</span><input defaultValue={product.name} maxLength={140} minLength={2} name="name" required /></label>
              <label className="field"><span>Brand</span><input defaultValue={product.brand ?? ""} maxLength={100} name="brand" /></label>
              <label className="field"><span>Pack size</span><input defaultValue={product.packSize ?? ""} maxLength={60} name="packSize" placeholder="e.g. 800 g" /></label>
              <label className="field"><span>Serving size label</span><input defaultValue={product.servingSize ?? ""} maxLength={60} name="servingSize" placeholder="e.g. 40 g (about 1/3 cup)" /></label>
              <label className="field"><span>Serving quantity</span><input defaultValue={product.servingQuantity ?? ""} inputMode="decimal" min="0.01" name="servingQuantity" step="0.01" type="number" /></label>
              <label className="field"><span>Serving unit</span><select defaultValue={product.servingUnit ?? ""} name="servingUnit"><option value="">Choose a unit</option>{servingUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
              <label className="field"><span>Servings per package</span><input defaultValue={product.servingsPerPackage ?? ""} inputMode="decimal" min="0.01" name="servingsPerPackage" step="0.01" type="number" /></label>
              <label className="field"><span>Allergens</span><textarea defaultValue={product.allergens.map(displayAllergen).join(", ")} maxLength={500} name="allergens" placeholder="e.g. Milk, soy, wheat" rows={3} /></label>
              <label className="field"><span>Department</span><select defaultValue={department} name="department"><option value="">Choose a department</option>{supermarketDepartments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="field"><span>Barcode / GTIN</span><input defaultValue={product.barcode ?? ""} inputMode="numeric" maxLength={14} name="barcode" /></label>
              <label className="field"><span>Product type</span><select defaultValue={product.productType} name="productType"><option value="PACKAGED">Packaged product</option><option value="GENERIC_PRODUCE">Loose produce</option><option value="FRESH_MEAT">Fresh meat</option><option value="SEAFOOD">Seafood</option><option value="DAIRY">Dairy</option><option value="BAKERY">Bakery</option><option value="FROZEN">Frozen</option><option value="HOUSEHOLD">Household</option><option value="PERSONAL_CARE">Personal care</option><option value="BEVERAGE">Beverage</option><option value="OTHER">Other</option></select></label>
              <div className="form-actions"><button className="primary-button" type="submit">Save product details</button></div>
            </form>
          </details>
        </article>

        <ProductMergePanel sourceProductId={product.id} sourceProductName={displayName} />
        </> : null}

        {knowledge ? <article className={styles.panel}><h2>About {canonicalName ?? displayName}</h2><p className="subtle">{knowledge.overview}</p>{knowledge.origin ? <><h3>Origin and production</h3><p className="subtle">{knowledge.origin}</p></> : null}</article> : null}
        {knowledge ? <article className={styles.panel}><h2>Common uses</h2><div className={styles.tags}>{knowledge.uses.map((use) => <span key={use}>{use}</span>)}</div><h3>Storage</h3><ul className={styles.list}>{knowledge.storage.map((tip) => <li className={styles.listItem} key={tip}><span>{tip}</span></li>)}</ul></article> : null}

        {!isGenericProduct ? <article className={styles.panel}>
          <h2>Product identity</h2>
          <ul className={styles.list}>
            <li className={styles.listItem}><span>Detailed name</span><strong>{displayName}</strong></li>
            {canonicalName ? <li className={styles.listItem}><span>Product family</span><strong>{canonicalName}</strong></li> : null}
            {product.brand ? <li className={styles.listItem}><span>Brand</span><strong>{product.brand}</strong></li> : null}
            {product.packSize ? <li className={styles.listItem}><span>Pack size</span><strong>{product.packSize}</strong></li> : null}
            {product.servingSize ? <li className={styles.listItem}><span>Serving size</span><strong>{product.servingSize}</strong></li> : null}
            {product.barcode ? <li className={styles.listItem}><span>Barcode</span><strong>{product.barcode}</strong></li> : barcodeRequired ? <li className={styles.listItem}><span>Barcode</span><strong>Not known</strong></li> : null}
            {department ? <li className={styles.listItem}><span>Department</span><strong>{department}</strong></li> : null}
          </ul>
        </article> : null}

        {!isGenericProduct ? <article className={styles.panel}>
          <p className="eyebrow">ALLERGEN INFORMATION</p>
          <h2>Contains</h2>
          {product.allergens.length ? (
            <div className={styles.tags}>{product.allergens.map((allergen) => <span key={allergen}>{displayAllergen(allergen)}</span>)}</div>
          ) : (
            <p className="subtle">No allergen information has been recorded for this product. Always check the product packaging before consumption.</p>
          )}
        </article> : null}

        {product.storeProducts.length ? <article className={styles.panel}><h2>Current retailer listings</h2><ul className={styles.list}>{product.storeProducts.map((listing) => { const price = latestPriceByRetailer.get(listing.retailer); return <li className={styles.listItem} key={listing.id}><div className={styles.listingIdentity}><div className={styles.listingImage}>{listing.imageUrl ? <img alt="" src={listing.imageUrl} /> : <span>◈</span>}</div><div><strong>{listing.retailer}</strong><small>{listing.retailerProductName}</small></div></div><div><strong>{price ? money(price.price) : listing.packSize ?? "—"}</strong><small>{price ? `${price.isSpecial ? "On special" : "Regular price"} · ${date(price.observedAt)}` : listing.aisle ?? date(listing.lastSeenAt)}</small></div></li>; })}</ul></article> : null}
        {product.priceObservations.length ? <article className={styles.panel}><h2>Recent price history</h2><ul className={styles.list}>{product.priceObservations.slice(0, 12).map((observation) => <li className={styles.listItem} key={observation.id}><div><strong>{observation.retailer}</strong><small>{observation.source}{observation.isSpecial ? " · special" : " · regular"}</small></div><div><strong>{money(observation.price)}</strong><small>{date(observation.observedAt)}</small></div></li>)}</ul></article> : null}
        {product.recipes.length ? <article className={styles.panel}><h2>Used in recipes</h2><div className={styles.recipeGrid}>{product.recipes.map((recipe) => <a className={styles.recipeCard} href={recipe.sourceUrl ?? "/recipes"} key={recipe.id} rel={recipe.sourceUrl ? "noopener noreferrer" : undefined} target={recipe.sourceUrl ? "_blank" : undefined}>{recipe.imageUrl ? <img alt={`Finished ${recipe.name}`} src={recipe.imageUrl} /> : <span aria-hidden="true">&#9671;</span>}<div><h3>{recipe.name}</h3>{recipe.description ? <p>{recipe.description}</p> : null}<small>{[recipe.minutes ? `${recipe.minutes} min` : null, recipe.sourceName ?? "Food recipe"].filter(Boolean).join(" · ")}</small><strong>View recipe →</strong></div></a>)}</div></article> : null}

        {!isGenericProduct ? <article className={`${styles.panel} ${styles.nutritionPanel}`}>
          <div className={styles.nip}>
            <h2>Nutrition Information</h2>
            <p><strong>Servings per package:</strong> {product.servingsPerPackage === null ? "Not recorded" : formatQuantity(product.servingsPerPackage)}</p>
            <p><strong>Serving size:</strong> {product.servingSize ?? (product.servingQuantity !== null && product.servingUnit ? `${formatQuantity(product.servingQuantity)} ${product.servingUnit}` : "Not recorded")}</p>
            {nutrition.length ? (
              <>
                <p>Average quantity</p>
                <table>
                  <thead><tr><th>Nutrient</th>{hasPerServing ? <th>Per serving</th> : null}<th>Per 100 g / 100 mL</th></tr></thead>
                  <tbody>{nutrition.map((row) => <tr key={row.label}><th className={row.sub ? styles.nutritionSub : undefined}>{row.label}</th>{hasPerServing ? <td>{row.perServing ?? "—"}</td> : null}<td>{row.per100}</td></tr>)}</tbody>
                </table>
                <small>{hasPerServing ? "Per-serving values are calculated from the recorded serving quantity and the source per-100 values." : "A per-serving column is shown only when a numeric serving quantity in grams or millilitres is recorded."}</small>
              </>
            ) : (
              <p className="subtle">Nutrition values have not been recorded for this product yet. Add or enrich the product data to complete this panel.</p>
            )}
          </div>
        </article> : null}
      </section>
    </div>
  );
}
