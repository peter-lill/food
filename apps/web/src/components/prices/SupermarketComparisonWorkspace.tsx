"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { importSupermarketPrices } from "@/lib/prices/supermarket-comparison.actions";
import {
  initialSupermarketPriceActionState,
  supermarketRetailers,
  type SupermarketComparisonData,
  type SupermarketPriceActionState,
  type SupermarketPriceView,
  type SupermarketRetailer,
  type SupermarketShoppingItem,
} from "@/lib/prices/supermarket-comparison.types";
import styles from "@/app/prices/supermarket-comparison.module.css";

type ComparisonMode = "products" | "list";

type ProductComparison = {
  key: string;
  name: string;
  retailerPrices: Array<{ retailer: SupermarketRetailer; price: SupermarketPriceView }>;
  bestPrice: SupermarketPriceView;
  savings: number;
};

type ItemRetailerMatch = {
  retailer: SupermarketRetailer;
  price: SupermarketPriceView;
  estimate: number;
};

type ShoppingItemComparison = {
  item: SupermarketShoppingItem;
  matches: ItemRetailerMatch[];
  best: ItemRetailerMatch | null;
};

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function checkedDate(value: string | null) {
  if (!value) return "No prices yet";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Brisbane",
  });
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normaliseName(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").trim();
}

function nameTokens(value: string) {
  return new Set(
    normaliseName(value)
      .split(" ")
      .filter((token) => token.length > 1)
      .map((token) => token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token),
  );
}

function matchScore(itemName: string, productName: string) {
  const item = normaliseName(itemName);
  const product = normaliseName(productName);
  if (!item || !product) return 0;
  if (item === product) return 100;
  if (item.includes(product) || product.includes(item)) return 85;

  const itemSet = nameTokens(item);
  const productSet = nameTokens(product);
  const overlap = [...itemSet].filter((token) => productSet.has(token)).length;
  const denominator = Math.max(itemSet.size, productSet.size, 1);
  const ratio = overlap / denominator;
  return ratio >= 0.5 ? Math.round(45 + ratio * 35) : 0;
}

function comparisonValue(price: SupermarketPriceView) {
  return price.unitPrice ?? price.price;
}

function itemMultiplier(item: SupermarketShoppingItem) {
  const unit = normaliseName(item.unit ?? "item");
  const countUnits = new Set(["item", "each", "ea", "pack", "packet", "tin", "can", "bottle"]);
  if (!item.quantity || item.quantity <= 1 || !countUnits.has(unit)) return 1;
  return Math.ceil(item.quantity);
}

function buildProductComparisons(prices: SupermarketPriceView[]) {
  const grouped = new Map<string, SupermarketPriceView[]>();

  for (const price of prices) {
    const key = normaliseName(price.productName);
    const existing = grouped.get(key) ?? [];
    existing.push(price);
    grouped.set(key, existing);
  }

  return [...grouped.entries()].map(([key, entries]): ProductComparison => {
    const retailerPrices = supermarketRetailers
      .map((retailer) => {
        const candidates = entries
          .filter((entry) => entry.retailer === retailer)
          .sort((left, right) => comparisonValue(left) - comparisonValue(right) || left.price - right.price);
        return candidates[0] ? { retailer, price: candidates[0] } : null;
      })
      .filter((entry): entry is { retailer: SupermarketRetailer; price: SupermarketPriceView } => entry !== null)
      .sort((left, right) => comparisonValue(left.price) - comparisonValue(right.price));
    const bestPrice = retailerPrices[0].price;
    const highest = retailerPrices[retailerPrices.length - 1]?.price ?? bestPrice;

    return {
      key,
      name: entries[0].productName,
      retailerPrices,
      bestPrice,
      savings: roundMoney(comparisonValue(highest) - comparisonValue(bestPrice)),
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function compareShoppingItem(item: SupermarketShoppingItem, prices: SupermarketPriceView[]): ShoppingItemComparison {
  const multiplier = itemMultiplier(item);
  const matches = supermarketRetailers
    .map((retailer) => {
      const candidates = prices
        .filter((price) => price.retailer === retailer)
        .map((price) => ({ price, score: matchScore(item.name, price.productName) }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score || comparisonValue(left.price) - comparisonValue(right.price));
      const selected = candidates[0]?.price;
      return selected ? { retailer, price: selected, estimate: roundMoney(selected.price * multiplier) } : null;
    })
    .filter((match): match is ItemRetailerMatch => match !== null)
    .sort((left, right) => left.estimate - right.estimate);

  return { item, matches, best: matches[0] ?? null };
}

function FieldError({ state, field }: { state: SupermarketPriceActionState; field: string }) {
  const error = state.fieldErrors?.[field];
  return error ? <small className="field-error">{error}</small> : null;
}

function CaptureSubmitButton() {
  const { pending } = useFormStatus();
  return <button className="primary-button" disabled={pending} type="submit">{pending ? "Saving prices…" : "Add prices"}</button>;
}

function PriceCaptureForm() {
  const [state, action] = useActionState(importSupermarketPrices, initialSupermarketPriceActionState);

  return (
    <details className={`card ${styles.capture}`}>
      <summary>Add catalogue or shelf prices</summary>
      <div className={styles.captureIntro}>
        <div>
          <p className="eyebrow">PRICE CAPTURE</p>
          <h2>Paste one or many prices</h2>
          <p className="subtle">Use pipe-separated lines: product | shelf price | pack size | unit price | brand | special.</p>
        </div>
        <code>Milk | 3.20 | 2 L | 1.60 | Dairy Farmers | special</code>
      </div>
      <form action={action} className={styles.captureForm}>
        <label className="field">
          <span>Retailer</span>
          <select aria-invalid={Boolean(state.fieldErrors?.retailer)} defaultValue="Woolworths" name="retailer" required>
            {supermarketRetailers.map((retailer) => <option key={retailer} value={retailer}>{retailer}</option>)}
          </select>
          <FieldError field="retailer" state={state} />
        </label>
        <label className="field">
          <span>Checked date <small>(optional)</small></span>
          <input aria-invalid={Boolean(state.fieldErrors?.checkedAt)} name="checkedAt" type="date" />
          <FieldError field="checkedAt" state={state} />
        </label>
        <label className={`field ${styles.linesField}`}>
          <span>Price lines</span>
          <textarea
            aria-invalid={Boolean(state.fieldErrors?.lines)}
            name="lines"
            placeholder={"Milk | 3.20 | 2 L | 1.60 | Dairy Farmers | special\nSalmon portions | 12.00 | 500 g | 2.40 |  |"}
            required
            rows={7}
          />
          <FieldError field="lines" state={state} />
        </label>
        {state.status !== "idle" ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        <div className={styles.captureActions}>
          <CaptureSubmitButton />
          <span>New entries become the latest price for the matching retailer, product, brand and pack size.</span>
        </div>
      </form>
    </details>
  );
}

function ProductMode({ comparisons }: { comparisons: ProductComparison[] }) {
  const [query, setQuery] = useState("");
  const filtered = comparisons.filter((comparison) => comparison.name.toLocaleLowerCase("en-AU").includes(query.trim().toLocaleLowerCase("en-AU")));

  return (
    <section className={styles.modePanel}>
      <div className={styles.modeHeading}>
        <div><p className="eyebrow">INDIVIDUAL ITEMS</p><h2>Compare a product</h2><p className="subtle">The cheapest comparable unit price is used when one is available; otherwise shelf price is used.</p></div>
        <label className="field"><span>Search products</span><input onChange={(event) => setQuery(event.target.value)} placeholder="e.g. milk or salmon" type="search" value={query} /></label>
      </div>

      {comparisons.length === 0 ? (
        <div className="pantry-empty"><strong>No supermarket prices yet.</strong><p>Add catalogue or shelf prices below to begin comparing stores.</p></div>
      ) : filtered.length === 0 ? (
        <div className="pantry-empty"><strong>No products match this search.</strong><p>Try a broader product name.</p></div>
      ) : (
        <div className={styles.productGrid}>
          {filtered.map((comparison) => (
            <article className={styles.productCard} key={comparison.key}>
              <div className={styles.productTitle}>
                <div><h3>{comparison.name}</h3><span>{comparison.retailerPrices.length} of 3 retailers priced</span></div>
                <span className="badge success">Best: {comparison.bestPrice.retailer}</span>
              </div>
              <div className={styles.storeRows}>
                {comparison.retailerPrices.map(({ retailer, price }, index) => (
                  <div className={index === 0 ? styles.bestStoreRow : styles.storeRow} key={`${comparison.key}-${retailer}`}>
                    <div><strong>{retailer}</strong><span>{price.brand || "Any brand"} · {price.packSize || "Pack size not recorded"}</span></div>
                    <div>
                      {price.isSpecial ? <small>Special</small> : null}
                      <strong>{money(price.price)}</strong>
                      <span>{price.unitPrice ? `${money(price.unitPrice)} unit price` : "Shelf price comparison"}</span>
                    </div>
                  </div>
                ))}
              </div>
              <footer><span>Checked {checkedDate(comparison.bestPrice.checkedAt)}</span><strong>{comparison.savings > 0 ? `Save up to ${money(comparison.savings)}` : "Same comparison price"}</strong></footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ShoppingListMode({ data }: { data: SupermarketComparisonData }) {
  const [selectedListId, setSelectedListId] = useState(data.shoppingLists[0]?.id ?? "");
  const selectedList = data.shoppingLists.find((list) => list.id === selectedListId) ?? data.shoppingLists[0];
  const itemComparisons = useMemo(
    () => selectedList ? selectedList.items.map((item) => compareShoppingItem(item, data.prices)) : [],
    [data.prices, selectedList],
  );

  const storeTotals = supermarketRetailers.map((retailer) => {
    const matches = itemComparisons.map((comparison) => comparison.matches.find((match) => match.retailer === retailer)).filter((match): match is ItemRetailerMatch => Boolean(match));
    return {
      retailer,
      total: roundMoney(matches.reduce((sum, match) => sum + match.estimate, 0)),
      matchedCount: matches.length,
      missingCount: itemComparisons.length - matches.length,
    };
  });
  const splitTotal = roundMoney(itemComparisons.reduce((sum, comparison) => sum + (comparison.best?.estimate ?? 0), 0));
  const splitMatchedCount = itemComparisons.filter((comparison) => comparison.best).length;
  const completeStores = storeTotals.filter((store) => store.missingCount === 0).sort((left, right) => left.total - right.total);
  const bestCompleteStore = completeStores[0] ?? null;
  const splitSavings = bestCompleteStore ? roundMoney(bestCompleteStore.total - splitTotal) : null;

  if (data.shoppingLists.length === 0) {
    return <section className={styles.modePanel}><div className="pantry-empty"><strong>No Shopping lists available.</strong><p>Create a Shopping list first, then return here to estimate retailer totals.</p></div></section>;
  }

  return (
    <section className={styles.modePanel}>
      <div className={styles.modeHeading}>
        <div><p className="eyebrow">WHOLE LIST</p><h2>Compare a shopping list</h2><p className="subtle">Estimates use one matching shelf-price pack per item, except count-based quantities which are multiplied.</p></div>
        <label className="field"><span>Shopping list</span><select onChange={(event) => setSelectedListId(event.target.value)} value={selectedList?.id ?? ""}>{data.shoppingLists.map((list) => <option key={list.id} value={list.id}>{list.name} · {list.items.length} remaining</option>)}</select></label>
      </div>

      {selectedList && selectedList.items.length === 0 ? (
        <div className="pantry-empty"><strong>This Shopping list has no remaining items.</strong><p>Add or uncheck items before comparing retailers.</p></div>
      ) : (
        <>
          <div className={styles.totalGrid}>
            {storeTotals.map((store) => (
              <article className="card" key={store.retailer}>
                <p className="eyebrow">{store.retailer}</p>
                <strong className={styles.totalValue}>{store.matchedCount ? money(store.total) : "—"}</strong>
                <p>{store.matchedCount}/{itemComparisons.length} items matched{store.missingCount ? ` · ${store.missingCount} missing` : " · complete"}</p>
              </article>
            ))}
            <article className={`card ${styles.splitCard}`}>
              <p className="eyebrow">SPLIT SHOP</p>
              <strong className={styles.totalValue}>{splitMatchedCount ? money(splitTotal) : "—"}</strong>
              <p>{splitMatchedCount}/{itemComparisons.length} items matched{splitSavings !== null && splitSavings > 0 ? ` · saves ${money(splitSavings)}` : " · cheapest item-by-item"}</p>
            </article>
          </div>

          <div className={styles.listRows}>
            {itemComparisons.map((comparison) => (
              <article className={styles.listRow} key={comparison.item.id}>
                <div className={styles.listItemName}>
                  <strong>{comparison.item.name}</strong>
                  <span>{comparison.item.quantity ?? 1} {comparison.item.unit ?? "item"}</span>
                </div>
                {comparison.matches.length === 0 ? (
                  <span className="badge neutral">No price match</span>
                ) : (
                  <div className={styles.matchPills}>
                    {comparison.matches.map((match, index) => (
                      <span className={index === 0 ? styles.bestMatch : styles.match} key={`${comparison.item.id}-${match.retailer}`}>
                        <small>{match.retailer}</small><strong>{money(match.estimate)}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

          <p className={styles.estimateNote}>{bestCompleteStore ? `Best single-store estimate: ${bestCompleteStore.retailer} at ${money(bestCompleteStore.total)}.` : "No retailer currently has a price match for every remaining item."} Product matching is automatic and should be checked before relying on the estimate.</p>
        </>
      )}
    </section>
  );
}

export function SupermarketComparisonWorkspace({ data, loadError }: { data: SupermarketComparisonData; loadError: boolean }) {
  const [mode, setMode] = useState<ComparisonMode>("products");
  const productComparisons = useMemo(() => buildProductComparisons(data.prices), [data.prices]);

  if (loadError) {
    return <section className="pantry-error"><strong>Supermarket comparisons could not be loaded.</strong><p>Check the database connection and try again.</p></section>;
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.summaryGrid}>
        <article className="card"><p className="eyebrow">CURRENT PRICES</p><strong className={styles.summaryValue}>{data.priceCount}</strong><p>Latest retailer, product and pack observations.</p></article>
        <article className="card"><p className="eyebrow">MATCHABLE PRODUCTS</p><strong className={styles.summaryValue}>{data.productCount}</strong><p>Normalised supermarket product names.</p></article>
        <article className="card"><p className="eyebrow">SHOPPING LISTS</p><strong className={styles.summaryValue}>{data.shoppingLists.length}</strong><p>Lists available for whole-store estimates.</p></article>
        <article className="card"><p className="eyebrow">LAST CHECKED</p><strong className={styles.summaryDate}>{checkedDate(data.latestCheckedAt)}</strong><p>Newest recorded supermarket observation.</p></article>
      </section>

      <section className={`card ${styles.modeSwitch}`} aria-label="Comparison mode">
        <button className={mode === "products" ? styles.activeMode : ""} onClick={() => setMode("products")} type="button">Individual items</button>
        <button className={mode === "list" ? styles.activeMode : ""} onClick={() => setMode("list")} type="button">Whole Shopping list</button>
      </section>

      {mode === "products" ? <ProductMode comparisons={productComparisons} /> : <ShoppingListMode data={data} />}
      <PriceCaptureForm />
    </div>
  );
}
