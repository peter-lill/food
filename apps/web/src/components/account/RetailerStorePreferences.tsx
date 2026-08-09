"use client";

import { useState } from "react";
import styles from "./account.module.css";

type RetailerName = "Coles" | "Woolworths";
type Store = {
  retailer: RetailerName;
  storeId: string;
  name: string;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number | null;
};

type Props = {
  homePostcode: string;
  initialEnabled: RetailerName[];
  initialStores: Store[];
};

const retailers: RetailerName[] = ["Coles", "Woolworths"];

function directionsUrl(store: Store) {
  const query = store.latitude !== null && store.longitude !== null
    ? `${store.latitude},${store.longitude}`
    : [store.name, store.address, store.postcode].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function RetailerStorePreferences({ homePostcode, initialEnabled, initialStores }: Props) {
  const [enabled, setEnabled] = useState(new Set(initialEnabled));
  const [savedStores, setSavedStores] = useState(initialStores);
  const [results, setResults] = useState<Partial<Record<RetailerName, Store[]>>>({});
  const [colesQuery, setColesQuery] = useState(homePostcode);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function toggleRetailer(retailer: RetailerName, nextEnabled: boolean) {
    const previous = new Set(enabled);
    const next = new Set(enabled);
    if (nextEnabled) next.add(retailer); else next.delete(retailer);
    setEnabled(next);
    setError("");
    const response = await fetch("/api/account/preferences/retailers", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retailer, enabled: nextEnabled }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      setEnabled(previous);
      setError(body.error ?? `Unable to update ${retailer}.`);
    }
  }

  async function findStores(retailer: RetailerName) {
    setPending(`find-${retailer}`); setError(""); setMessage("");
    const params = new URLSearchParams({ retailer });
    if (retailer === "Coles" && colesQuery.trim()) params.set("query", colesQuery.trim());
    const response = await fetch(`/api/account/preferences/stores?${params}`);
    const body = await response.json().catch(() => ({})) as { stores?: Store[]; error?: string };
    setPending("");
    if (!response.ok) { setError(body.error ?? `Unable to find ${retailer} stores.`); return; }
    setResults((current) => ({ ...current, [retailer]: body.stores ?? [] }));
  }

  async function saveStore(store: Store) {
    setPending(`save-${store.retailer}-${store.storeId}`); setError(""); setMessage("");
    const response = await fetch("/api/account/preferences/stores", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(store),
    });
    const body = await response.json().catch(() => ({})) as { store?: Store; error?: string };
    setPending("");
    if (!response.ok || !body.store) { setError(body.error ?? "Unable to save that store."); return; }
    setSavedStores((current) => [...current.filter((item) => !(item.retailer === store.retailer && item.storeId === store.storeId)), body.store!]);
    setMessage(`${store.name} added to your preferred stores.`);
  }

  async function removeStore(store: Store) {
    setPending(`remove-${store.retailer}-${store.storeId}`); setError("");
    const response = await fetch(`/api/account/preferences/stores?retailer=${encodeURIComponent(store.retailer)}&storeId=${encodeURIComponent(store.storeId)}`, { method: "DELETE" });
    setPending("");
    if (!response.ok) { setError("Unable to remove that store."); return; }
    setSavedStores((current) => current.filter((item) => !(item.retailer === store.retailer && item.storeId === store.storeId)));
  }

  return (
    <section className={`${styles.accountCard} ${styles.retailerCard}`}>
      <p className="eyebrow">YOUR RETAILERS</p>
      <h2>Choose where you shop</h2>
      <p className="subtle">Only enabled retailers appear in price comparisons. Select the stores you actually use; the nearest store is only a suggestion.</p>

      {!homePostcode ? <p className={styles.setupNotice}>Add and save a four-digit home postcode above before finding nearby stores.</p> : null}
      <div className={styles.retailerList}>
        {retailers.map((retailer) => {
          const isEnabled = enabled.has(retailer);
          const preferred = savedStores.filter((store) => store.retailer === retailer);
          const nearby = results[retailer] ?? [];
          return (
            <article className={styles.retailerPanel} key={retailer}>
              <div className={styles.retailerHeading}>
                <div><strong>{retailer}</strong><small>{isEnabled ? "Included in your prices" : "Hidden from your prices"}</small></div>
                <label className={styles.switchLabel}>
                  <input checked={isEnabled} onChange={(event) => void toggleRetailer(retailer, event.target.checked)} type="checkbox" />
                  <span>{isEnabled ? "Enabled" : "Disabled"}</span>
                </label>
              </div>

              {isEnabled ? (
                <>
                  {preferred.length ? (
                    <div className={styles.savedStores}>
                      {preferred.map((store) => <StoreRow action="remove" key={store.storeId} onAction={() => void removeStore(store)} pending={pending.includes(store.storeId)} store={store} />)}
                    </div>
                  ) : <p className={styles.storePrompt}>No preferred {retailer} store selected. Prices may not reflect your local store.</p>}
                  {retailer === "Coles" ? (
                    <form className={styles.storeSearch} onSubmit={(event) => { event.preventDefault(); void findStores(retailer); }}>
                      <label htmlFor="coles-store-query">Suburb, postcode or store number</label>
                      <div>
                        <input id="coles-store-query" onChange={(event) => setColesQuery(event.target.value)} placeholder="e.g. Springwood or 4472" value={colesQuery} />
                        <button className={styles.secondaryButton} disabled={!homePostcode || !colesQuery.trim() || pending === `find-${retailer}`} type="submit">
                          {pending === `find-${retailer}` ? "Finding stores..." : "Find Coles stores"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button className={styles.secondaryButton} disabled={!homePostcode || pending === `find-${retailer}`} onClick={() => void findStores(retailer)} type="button">
                      {pending === `find-${retailer}` ? "Finding stores..." : `Find ${retailer} stores near ${homePostcode || "home"}`}
                    </button>
                  )}
                  {nearby.length ? (
                    <div className={styles.storeResults}>
                      <small>Nearby suggestions - choose any store you prefer</small>
                      {nearby.map((store) => {
                        const saved = preferred.some((item) => item.storeId === store.storeId);
                        return <StoreRow action={saved ? "saved" : "add"} key={store.storeId} onAction={() => void saveStore(store)} pending={pending.includes(store.storeId)} store={store} />;
                      })}
                    </div>
                  ) : null}
                </>
              ) : null}
            </article>
          );
        })}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {message ? <p className={styles.success} role="status">{message}</p> : null}
    </section>
  );
}

function StoreRow({ store, action, pending, onAction }: { store: Store; action: "add" | "remove" | "saved"; pending: boolean; onAction: () => void }) {
  return (
    <div className={styles.storeRow}>
      <div>
        <strong>{store.name}</strong>
        <small>{store.address || store.postcode || "Address unavailable"}{typeof store.distanceKm === "number" ? ` - ${store.distanceKm.toFixed(1)} km` : ""}</small>
      </div>
      <a href={directionsUrl(store)} rel="noreferrer" target="_blank">Map</a>
      {action === "saved" ? <span className={styles.preferredBadge}>Preferred</span> : (
        <button disabled={pending} onClick={onAction} type="button">{pending ? "Saving..." : action === "add" ? "Choose" : "Remove"}</button>
      )}
    </div>
  );
}
