"use client";

import { useState } from "react";
import type {
  LiveGroceryPriceErrorResponse,
  LiveGroceryPriceSearchResponse,
} from "@/lib/prices/live-grocery-price.types";
import type { SupermarketShoppingList } from "@/lib/prices/supermarket-comparison.types";
import styles from "@/app/prices/supermarket-comparison.module.css";

function money(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function searchedTime(value: string) {
  return new Date(value).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  });
}

export function LiveShoppingPriceSearch({ list }: { list: SupermarketShoppingList }) {
  const [allowSubstitutes, setAllowSubstitutes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LiveGroceryPriceSearchResponse | null>(null);

  async function searchPrices() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/prices/shopping-list/${encodeURIComponent(list.id)}/search`, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ allowSubstitutes }),
      });
      const payload = await response.json() as LiveGroceryPriceSearchResponse | LiveGroceryPriceErrorResponse;

      if (!response.ok || payload.status === "error") {
        throw new Error(payload.status === "error" ? payload.error : `Price search returned HTTP ${response.status}.`);
      }

      setResult(payload);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Current grocery prices could not be searched.");
    } finally {
      setLoading(false);
    }
  }

  const completeRetailers = result?.retailerTotals
    .filter((retailer) => retailer.missingCount === 0)
    .sort((left, right) => left.total - right.total) ?? [];
  const bestCompleteRetailer = completeRetailers[0] ?? null;

  return (
    <section className={`card ${styles.liveSearch}`}>
      <div className={styles.liveSearchHeading}>
        <div>
          <p className="eyebrow">CURRENT ONLINE PRICES</p>
          <h3>Search this Shopping list</h3>
          <p className="subtle">
            Search Australian grocery listings for every remaining item, compare retailer totals and use a compatible substitute when the exact product is unavailable.
          </p>
        </div>
        <button
          className="primary-button"
          disabled={loading || list.items.length === 0}
          onClick={() => void searchPrices()}
          type="button"
        >
          {loading ? "Searching prices…" : result ? "Refresh current prices" : "Search current prices"}
        </button>
      </div>

      <label className={styles.substituteToggle}>
        <input
          checked={allowSubstitutes}
          disabled={loading}
          onChange={(event) => setAllowSubstitutes(event.target.checked)}
          type="checkbox"
        />
        <span>
          <strong>Allow comparable substitutes</strong>
          <small>Preserves stated dietary requirements and product type; different brands or pack sizes are clearly labelled.</small>
        </span>
      </label>

      {error ? <p className="form-message error" role="alert">{error}</p> : null}
      {result?.warning ? <p className="form-message error" role="status">{result.warning}</p> : null}

      {result ? (
        <div className={styles.liveResults}>
          <div className={styles.liveSummaryGrid}>
            {result.retailerTotals.map((retailer) => (
              <article className={retailer.missingCount === 0 ? styles.liveCompleteTotal : styles.liveTotal} key={retailer.retailer}>
                <span>{retailer.retailer}</span>
                <strong>{retailer.matchedCount ? money(retailer.total) : "—"}</strong>
                <small>{retailer.matchedCount}/{result.items.length} priced{retailer.missingCount ? ` · ${retailer.missingCount} missing` : " · complete"}</small>
              </article>
            ))}
            <article className={styles.liveSplitTotal}>
              <span>Cheapest split shop</span>
              <strong>{result.splitMatchedCount ? money(result.splitTotal) : "—"}</strong>
              <small>{result.splitMatchedCount}/{result.items.length} items priced</small>
            </article>
          </div>

          <div className={styles.liveMeta}>
            <span>Location: {result.location}</span>
            <span>Checked {searchedTime(result.searchedAt)}</span>
            <span>{result.liveItemCount} refreshed · {result.cachedItemCount} from six-hour cache</span>
            {bestCompleteRetailer ? <strong>Best complete store: {bestCompleteRetailer.retailer} at {money(bestCompleteRetailer.total)}</strong> : null}
          </div>

          <div className={styles.liveItemRows}>
            {result.items.map((itemResult) => (
              <article className={styles.liveItem} key={itemResult.item.id}>
                <header>
                  <div>
                    <strong>{itemResult.item.name}</strong>
                    <span>{itemResult.item.quantity ?? 1} {itemResult.item.unit ?? "item"} · searched “{itemResult.query}”</span>
                  </div>
                  {itemResult.best ? (
                    <span className="badge success">Best {money(itemResult.best.estimatedTotal)}</span>
                  ) : (
                    <span className="badge neutral">No suitable price</span>
                  )}
                </header>

                {itemResult.error ? <p className={styles.liveItemError}>{itemResult.error}</p> : null}

                {itemResult.matches.length > 0 ? (
                  <div className={styles.liveMatchGrid}>
                    {itemResult.matches.map((match, index) => (
                      <div className={index === 0 ? styles.liveBestMatch : styles.liveMatchCard} key={`${itemResult.item.id}-${match.retailer}`}>
                        <div className={styles.liveMatchTopline}>
                          <strong>{match.retailer}</strong>
                          <span className={match.matchKind === "exact" ? styles.exactBadge : styles.substituteBadge}>
                            {match.matchKind === "exact" ? "Exact" : "Substitute"}
                          </span>
                        </div>
                        <span className={styles.liveProductName}>{match.productName}</span>
                        <div className={styles.livePriceLine}>
                          <strong>{money(match.estimatedTotal)}</strong>
                          <span>{money(match.price)} shelf{match.packSize ? ` · ${match.packSize}` : ""}</span>
                        </div>
                        <small>
                          {match.unitPrice !== null && match.unitLabel ? `${money(match.unitPrice)}${match.unitLabel} · ` : ""}
                          {match.isSpecial ? "Special · " : ""}
                          {match.cached ? "cached" : "live"}
                        </small>
                        <p>{match.matchReason}</p>
                        {match.sourceUrl ? (
                          <a href={match.sourceUrl} rel="noreferrer" target="_blank">View product</a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.liveNoMatch}>
                    No exact product or safe substitute was found. Keep the item on the list and check it manually rather than using an unsuitable replacement.
                  </p>
                )}
              </article>
            ))}
          </div>

          <p className={styles.estimateNote}>
            Results come from Google Shopping through SerpApi and may vary by store, postcode, stock and promotion timing. Substitutes are suggestions, not silent replacements; check allergens, ingredients and pack labels before buying.
          </p>
        </div>
      ) : (
        <p className={styles.liveSearchNote}>
          Exact matches are preferred. A substitute is only considered when product type and stated requirements remain compatible, and Food calculates how many packs are needed for the requested quantity.
        </p>
      )}
    </section>
  );
}
