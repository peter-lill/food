"use client";

import { useMemo, useState } from "react";
import type {
  PriceHistoryData,
  PriceHistoryObservation,
  ProductPriceHistory,
  RetailerPriceSummary,
} from "@/lib/prices/price-history.types";
import styles from "@/app/prices/price-history.module.css";

type SortMode = "recent" | "name" | "lowest" | "drop";

type ProductView = {
  product: ProductPriceHistory;
  observations: PriceHistoryObservation[];
  comparisonLabel: string;
  latestPrice: number;
  previousPrice: number | null;
  lowestPrice: number;
  averagePrice: number;
  changePercent: number | null;
  latestPurchasedAt: string;
  retailers: RetailerPriceSummary[];
};

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function date(value: string) {
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function retailerSummaries(observations: PriceHistoryObservation[]): RetailerPriceSummary[] {
  const grouped = new Map<string, PriceHistoryObservation[]>();

  for (const observation of observations) {
    const existing = grouped.get(observation.retailer) ?? [];
    existing.push(observation);
    grouped.set(observation.retailer, existing);
  }

  return Array.from(grouped.entries())
    .map(([retailer, entries]) => {
      const prices = entries.map((entry) => entry.comparisonPrice);
      return {
        retailer,
        observationCount: entries.length,
        latestPrice: roundMoney(entries[0].comparisonPrice),
        lowestPrice: roundMoney(Math.min(...prices)),
        averagePrice: roundMoney(average(prices)),
        latestPurchasedAt: entries[0].purchasedAt,
      };
    })
    .sort((a, b) => a.latestPrice - b.latestPrice || a.retailer.localeCompare(b.retailer));
}

function productView(product: ProductPriceHistory, selectedRetailer: string): ProductView | null {
  const observations = selectedRetailer
    ? product.observations.filter((observation) => observation.retailer === selectedRetailer)
    : product.observations;

  if (observations.length === 0) return null;

  const latest = observations[0];
  const comparable = observations.filter((observation) => observation.comparisonLabel === latest.comparisonLabel);
  const prices = comparable.map((observation) => observation.comparisonPrice);
  const previousPrice = comparable[1]?.comparisonPrice ?? null;
  const changePercent = previousPrice && previousPrice > 0
    ? ((latest.comparisonPrice - previousPrice) / previousPrice) * 100
    : null;

  return {
    product,
    observations,
    comparisonLabel: latest.comparisonLabel,
    latestPrice: roundMoney(latest.comparisonPrice),
    previousPrice: previousPrice === null ? null : roundMoney(previousPrice),
    lowestPrice: roundMoney(Math.min(...prices)),
    averagePrice: roundMoney(average(prices)),
    changePercent: changePercent === null ? null : Math.round(changePercent * 10) / 10,
    latestPurchasedAt: latest.purchasedAt,
    retailers: retailerSummaries(comparable),
  };
}

function TrendBadge({ changePercent }: { changePercent: number | null }) {
  if (changePercent === null) return <span className={`${styles.trend} ${styles.neutral}`}>First price</span>;
  if (Math.abs(changePercent) < 0.1) return <span className={`${styles.trend} ${styles.neutral}`}>No change</span>;
  if (changePercent < 0) return <span className={`${styles.trend} ${styles.down}`}>↓ {Math.abs(changePercent).toFixed(1)}%</span>;
  return <span className={`${styles.trend} ${styles.up}`}>↑ {changePercent.toFixed(1)}%</span>;
}

function ProductCard({ view }: { view: ProductView }) {
  const latest = view.observations[0];
  const history = view.observations.slice(0, 12);

  return (
    <article className={styles.productCard}>
      <div className={styles.productHeading}>
        <div>
          <p className="eyebrow">PRICE HISTORY</p>
          <h2>{view.product.name}</h2>
          <p>{latest.retailer} · {date(latest.purchasedAt)}</p>
        </div>
        <TrendBadge changePercent={view.changePercent} />
      </div>

      <div className={styles.metrics}>
        <span><strong>{money(view.latestPrice)}</strong><small>Latest {view.comparisonLabel}</small></span>
        <span><strong>{money(view.lowestPrice)}</strong><small>Lowest recorded</small></span>
        <span><strong>{money(view.averagePrice)}</strong><small>Average recorded</small></span>
        <span><strong>{view.observations.length}</strong><small>Purchases</small></span>
      </div>

      <details className={styles.details}>
        <summary>Compare retailers and purchases</summary>
        <div className={styles.detailGrid}>
          <section>
            <h3>Retailer comparison</h3>
            <div className={styles.retailerList}>
              {view.retailers.map((retailer, index) => (
                <div className={styles.retailerRow} key={retailer.retailer}>
                  <div>
                    <strong>{retailer.retailer}</strong>
                    <span>{retailer.observationCount} {retailer.observationCount === 1 ? "purchase" : "purchases"} · latest {date(retailer.latestPurchasedAt)}</span>
                  </div>
                  <div>
                    {index === 0 ? <small>Best latest</small> : null}
                    <strong>{money(retailer.latestPrice)}</strong>
                    <span>low {money(retailer.lowestPrice)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3>Purchase timeline</h3>
            <div className={styles.historyList}>
              {history.map((observation) => (
                <div className={styles.historyRow} key={observation.id}>
                  <div>
                    <strong>{observation.retailer}</strong>
                    <span>{date(observation.purchasedAt)} · {observation.quantity ?? 1} {observation.unit ?? "item"}</span>
                  </div>
                  <div>
                    <strong>{money(observation.comparisonPrice)}</strong>
                    <span>{observation.comparisonLabel} · line {money(observation.linePrice)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </details>
    </article>
  );
}

export function PriceHistoryWorkspace({ data, loadError }: { data: PriceHistoryData; loadError: boolean }) {
  const [query, setQuery] = useState("");
  const [retailer, setRetailer] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");

  const views = useMemo(() => {
    const normalisedQuery = query.trim().toLocaleLowerCase("en-AU");
    const matching = data.products
      .filter((product) => !normalisedQuery || product.name.toLocaleLowerCase("en-AU").includes(normalisedQuery))
      .map((product) => productView(product, retailer))
      .filter((view): view is ProductView => view !== null);

    return matching.sort((a, b) => {
      if (sort === "name") return a.product.name.localeCompare(b.product.name);
      if (sort === "lowest") return a.latestPrice - b.latestPrice || a.product.name.localeCompare(b.product.name);
      if (sort === "drop") return (a.changePercent ?? Number.POSITIVE_INFINITY) - (b.changePercent ?? Number.POSITIVE_INFINITY);
      return b.latestPurchasedAt.localeCompare(a.latestPurchasedAt) || a.product.name.localeCompare(b.product.name);
    });
  }, [data.products, query, retailer, sort]);

  const bestDrop = views
    .filter((view) => view.changePercent !== null && view.changePercent < 0)
    .sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0))[0];

  if (loadError) {
    return <section className="pantry-error"><strong>Price history could not be loaded.</strong><p>Check the database connection and try again.</p></section>;
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.summaryGrid}>
        <article className="card"><p className="eyebrow">TRACKED PRODUCTS</p><strong className={styles.summaryValue}>{data.productCount}</strong><p>Products with imported receipt prices.</p></article>
        <article className="card"><p className="eyebrow">PRICE OBSERVATIONS</p><strong className={styles.summaryValue}>{data.observationCount}</strong><p>Food lines contributing to history.</p></article>
        <article className="card"><p className="eyebrow">RETAILERS</p><strong className={styles.summaryValue}>{data.retailerCount}</strong><p>Stores represented in imported receipts.</p></article>
        <article className="card"><p className="eyebrow">BEST RECENT DROP</p><strong className={styles.summaryValue}>{bestDrop ? `${Math.abs(bestDrop.changePercent!).toFixed(1)}%` : "—"}</strong><p>{bestDrop?.product.name ?? "More repeat purchases needed."}</p></article>
      </section>

      <section className={`card ${styles.filters}`}>
        <label className="field">
          <span>Search products</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="e.g. salmon or yoghurt" type="search" value={query} />
        </label>
        <label className="field">
          <span>Retailer</span>
          <select onChange={(event) => setRetailer(event.target.value)} value={retailer}>
            <option value="">All retailers</option>
            {data.retailers.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Sort by</span>
          <select onChange={(event) => setSort(event.target.value as SortMode)} value={sort}>
            <option value="recent">Most recently purchased</option>
            <option value="name">Product name</option>
            <option value="lowest">Lowest latest price</option>
            <option value="drop">Largest recent drop</option>
          </select>
        </label>
        <div className={styles.resultCount}><strong>{views.length}</strong><span>{views.length === 1 ? "product" : "products"}</span></div>
      </section>

      {data.products.length === 0 ? (
        <section className="card pantry-empty"><strong>No receipt price history yet.</strong><p>Import a reviewed receipt with food prices to start tracking changes.</p></section>
      ) : views.length === 0 ? (
        <section className="card pantry-empty"><strong>No products match these filters.</strong><p>Try another product name or retailer.</p></section>
      ) : (
        <section className={styles.productList}>
          {views.map((view) => <ProductCard key={`${view.product.key}-${retailer}`} view={view} />)}
        </section>
      )}
    </div>
  );
}
