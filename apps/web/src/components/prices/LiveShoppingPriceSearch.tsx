"use client";

import { useEffect, useState } from "react";
import { RetailerLogo } from "@/components/retailers/RetailerLogo";
import { getCurrentLocation, type SearchLocationSource } from "@/lib/current-location";
import { formatProductName, formatProductQuantity, formatRetailProductName, formatSearchQuery } from "@/lib/products/product-formatter";
import type { LiveGroceryPriceErrorResponse, LiveGroceryPriceMatch, LiveGroceryPriceSearchResponse } from "@/lib/prices/live-grocery-price.types";
import type { SupermarketShoppingList } from "@/lib/prices/supermarket-comparison.types";
import styles from "./LiveShoppingPriceSearch.module.css";

function money(value: number) { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value); }
function searchedTime(value: string) { return new Date(value).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
function locationSourceLabel(source: SearchLocationSource) {
  if (source === "current") return "Current location";
  if (source === "home") return "Home location";
  if (source === "temporary") return "Selected location";
  return "Default search location";
}
function hasTransientSearchFailure(result: LiveGroceryPriceSearchResponse) {
  return result.items.some((item) => { const error = item.error?.toLocaleLowerCase("en-AU") ?? ""; return error.includes("aborted") || error.includes("timeout") || error.includes("timed out"); });
}
function wait(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function matchKey(itemId: string, retailer: string, sourceUrl: string | null, productName: string) {
  return [itemId, retailer, sourceUrl ?? "", productName].join("|");
}

export function LiveShoppingPriceSearch({ list }: { list: SupermarketShoppingList }) {
  const [allowSubstitutes, setAllowSubstitutes] = useState(true);
  const [locationMode, setLocationMode] = useState<"home" | "current">("home");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LiveGroceryPriceSearchResponse | null>(null);
  const [excludedMatches, setExcludedMatches] = useState<Set<string>>(new Set());
  const exclusionStorageKey = `food:shopping-price-exclusions:${list.id}`;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(exclusionStorageKey);
      const keys = stored ? JSON.parse(stored) : [];
      setExcludedMatches(Array.isArray(keys) && keys.every((key) => typeof key === "string") ? new Set(keys) : new Set());
    } catch {
      // A price search remains usable if the browser has unavailable or malformed local storage.
    }
  }, [exclusionStorageKey]);

  function excludeMatch(key: string) {
    setExcludedMatches((current) => {
      const next = new Set(current).add(key);
      try { window.localStorage.setItem(exclusionStorageKey, JSON.stringify([...next])); } catch { /* Storage is optional. */ }
      return next;
    });
  }

  async function requestPrices(currentLocation: Awaited<ReturnType<typeof getCurrentLocation>> | null) {
    const response = await fetch(`/api/prices/shopping-list/${encodeURIComponent(list.id)}/search`, { method: "POST", cache: "no-store", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ allowSubstitutes, currentLocation }) });
    const payload = await response.json() as LiveGroceryPriceSearchResponse | LiveGroceryPriceErrorResponse;
    if (!response.ok || payload.status === "error") throw new Error(payload.status === "error" ? payload.error : `Price search returned HTTP ${response.status}.`);
    return payload;
  }

  async function searchPrices() {
    setLoading(true); setError("");
    try {
      setLocating(locationMode === "current");
      const currentLocation = locationMode === "current" ? await getCurrentLocation() : null;
      setLocating(false);
      let payload = await requestPrices(currentLocation);
      if (hasTransientSearchFailure(payload)) { await wait(750); payload = await requestPrices(currentLocation); }
      setResult(payload);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Current grocery prices could not be searched.");
    } finally { setLocating(false); setLoading(false); }
  }

  const visibleItems = result?.items.map((item) => {
    const matches = item.matches.filter((match) => !excludedMatches.has(matchKey(item.item.id, match.retailer, match.sourceUrl, match.productName)));
    return { ...item, matches, best: matches[0] ?? null };
  }) ?? [];
  const visibleRetailerTotals = result?.retailerTotals.map((retailer) => {
    const matches = visibleItems
      .map((item) => item.matches.find((match) => match.retailer === retailer.retailer))
      .filter((match): match is LiveGroceryPriceMatch => Boolean(match));
    return { ...retailer, total: matches.reduce((total, match) => total + match.estimatedTotal, 0), matchedCount: matches.length, missingCount: visibleItems.length - matches.length };
  }) ?? [];
  const splitMatchedCount = visibleItems.filter((item) => item.best).length;
  const splitTotal = visibleItems.reduce((total, item) => total + (item.best?.estimatedTotal ?? 0), 0);
  const completeRetailers = visibleRetailerTotals.filter((retailer) => retailer.missingCount === 0).sort((left, right) => left.total - right.total);
  const bestCompleteRetailer = completeRetailers[0] ?? null;
  const visibleRetailers = visibleRetailerTotals.filter((retailer) => retailer.matchedCount > 0).sort((left, right) => Number(left.missingCount > 0) - Number(right.missingCount > 0) || left.total - right.total);

  return (
    <section className={`card ${styles.liveSearch}`}>
      <div className={styles.liveSearchHeading}><div><p className="eyebrow">CURRENT ONLINE PRICES</p><h3>Search this Shopping list</h3><p className="subtle">Search Australian grocery listings for every remaining item, compare retailer totals and use a compatible substitute when the exact product is unavailable.</p></div><button className="primary-button" disabled={loading || list.items.length === 0} onClick={() => void searchPrices()} type="button">{locating ? "Finding your location…" : loading ? "Searching prices…" : result ? "Refresh current prices" : "Search current prices"}</button></div>
      <fieldset className={styles.locationChoice}><legend>Search area</legend><label className={locationMode === "home" ? styles.locationOptionActive : styles.locationOption}><input checked={locationMode === "home"} disabled={loading} name={`price-location-${list.id}`} onChange={() => setLocationMode("home")} type="radio" /><span><strong>Home or saved default</strong><small>Uses your account home location, then the server fallback.</small></span></label><label className={locationMode === "current" ? styles.locationOptionActive : styles.locationOption}><input checked={locationMode === "current"} disabled={loading} name={`price-location-${list.id}`} onChange={() => setLocationMode("current")} type="radio" /><span><strong>Where I am now</strong><small>Requests device location once when this search starts.</small></span></label></fieldset>
      <label className={styles.substituteToggle}><input checked={allowSubstitutes} disabled={loading} onChange={(event) => setAllowSubstitutes(event.target.checked)} type="checkbox" /><span><strong>Allow comparable substitutes</strong><small>Preserves stated dietary requirements and product type; different brands or pack sizes are clearly labelled.</small></span></label>
      {error ? <p className="form-message error" role="alert">{error}</p> : null}
      {result?.warning ? <p className="form-message error" role="status">{result.warning}</p> : null}
      {result ? <div className={styles.liveResults}>
        <div className={styles.liveSummaryGrid}>{visibleRetailers.map((retailer) => <article className={retailer.missingCount === 0 ? styles.liveCompleteTotal : styles.liveTotal} key={retailer.retailer}><span><RetailerLogo compact retailer={retailer.retailer} /></span><strong>{money(retailer.total)}</strong><small>{retailer.matchedCount}/{visibleItems.length} priced{retailer.missingCount ? ` · ${retailer.missingCount} missing` : " · complete"}</small></article>)}<article className={styles.liveSplitTotal}><span>Cheapest split shop</span><strong>{splitMatchedCount ? money(splitTotal) : "—"}</strong><small>{splitMatchedCount}/{visibleItems.length} items priced</small></article></div>
        <div className={styles.liveMeta}><span>{locationSourceLabel(result.locationSource)}: {result.location}</span><span>Checked {searchedTime(result.searchedAt)}</span><span>{result.liveItemCount} refreshed · {result.cachedItemCount} from six-hour cache</span>{bestCompleteRetailer ? <strong className="retailer-inline">Best complete store: <RetailerLogo compact retailer={bestCompleteRetailer.retailer} /> at {money(bestCompleteRetailer.total)}</strong> : null}</div>
        <div className={styles.liveItemRows}>{visibleItems.map((itemResult) => {
          const quantity = formatProductQuantity(itemResult.item.quantity ?? 1, itemResult.item.unit ?? "item");
          return <article className={styles.liveItem} key={itemResult.item.id}><header><div><strong>{formatProductName(itemResult.item.name)}</strong><span>{quantity} · searched “{formatSearchQuery(itemResult.query)}”</span></div>{itemResult.best ? <span className="badge success">Best {money(itemResult.best.estimatedTotal)}</span> : <span className="badge neutral">No suitable price</span>}</header>
          {itemResult.error ? <p className={styles.liveItemError}>{itemResult.error}</p> : null}
          {itemResult.matches.length > 0 ? <div className={styles.liveMatchGrid}>{itemResult.matches.map((match, index) => <div className={index === 0 ? styles.liveBestMatch : styles.liveMatchCard} key={matchKey(itemResult.item.id, match.retailer, match.sourceUrl, match.productName)}><div className={styles.liveMatchTopline}><strong><RetailerLogo compact retailer={match.retailer} /></strong><div className={styles.liveMatchControls}><span className={match.matchKind === "exact" ? styles.exactBadge : styles.substituteBadge}>{match.matchKind === "exact" ? "Exact" : "Substitute"}</span><button aria-label={`Exclude ${match.retailer} result for ${itemResult.item.name}`} className={styles.rejectMatchButton} onClick={() => excludeMatch(matchKey(itemResult.item.id, match.retailer, match.sourceUrl, match.productName))} title="Not a match" type="button">×</button></div></div>{match.sourceUrl ? <a className={styles.liveProductLink} href={match.sourceUrl} rel="noreferrer" target="_blank">{formatRetailProductName(match.productName)} <span aria-hidden="true">↗</span></a> : <span className={styles.liveProductName}>{formatRetailProductName(match.productName)}</span>}<div className={styles.livePriceLine}><strong>{money(match.estimatedTotal)}</strong><span>{money(match.price)} shelf{match.packSize ? ` · ${formatRetailProductName(match.packSize)}` : ""}</span></div><small>{match.unitPrice !== null && match.unitLabel ? `${money(match.unitPrice)}${match.unitLabel} · ` : ""}{match.isSpecial ? "Special · " : ""}{match.cached ? "cached" : "live"}{match.storeSpecific ? "" : " · catalogue price, check your store"}</small><p>{match.matchReason}</p><div className={styles.matchActions}>{match.sourceUrl ? <a href={match.sourceUrl} rel="noreferrer" target="_blank">Open {match.retailer}</a> : null}</div></div>)}</div> : <p className={styles.liveNoMatch}>No exact product or safe substitute was found. Keep the item on the list and check it manually rather than using an unsuitable replacement.</p>}</article>;
        })}</div>
        <p className={styles.estimateNote}>Results come from Google Shopping through SerpApi and may vary by store, postcode, stock and promotion timing. Substitutes are suggestions, not silent replacements; check allergens, ingredients and pack labels before buying.</p>
      </div> : <p className={styles.liveSearchNote}>Exact matches are preferred. A substitute is only considered when product type and stated requirements remain compatible, and Food calculates how many packs are needed for the requested quantity.</p>}
    </section>
  );
}
