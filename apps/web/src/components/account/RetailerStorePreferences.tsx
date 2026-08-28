"use client";

import { useState } from "react";
import { RetailerLogo } from "@/components/retailers/RetailerLogo";
import { getCurrentLocation } from "@/lib/current-location";
import { retailerRequiresStore, supportedRetailers, type SupportedRetailer } from "@/lib/retailers/retailer-preferences";
import styles from "./account.module.css";

type RetailerName = SupportedRetailer;
type Store = {
  retailer: RetailerName;
  storeId: string;
  name: string;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number | null;
  priceCatalogAvailable?: boolean;
};

type Props = {
  homePostcode: string;
  initialEnabled: RetailerName[];
  initialStores: Store[];
};

const retailers: RetailerName[] = supportedRetailers.map((retailer) => retailer.id);

function mapUrl(store: Store) {
  const query = store.latitude !== null && store.longitude !== null
    ? `${store.latitude},${store.longitude}`
    : [store.name, store.address, store.postcode].filter(Boolean).join(", ");
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

export function RetailerStorePreferences({ homePostcode, initialEnabled, initialStores }: Props) {
  const [enabled, setEnabled] = useState(new Set(initialEnabled));
  const [savedStores, setSavedStores] = useState(initialStores);
  const [results, setResults] = useState<Partial<Record<RetailerName, Store[]>>>({});
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

  async function findStores(retailer: RetailerName, source: "home" | "current") {
    const pendingKey = `find-${source}-${retailer}`;
    setPending(pendingKey); setError(""); setMessage("");
    const params = new URLSearchParams({ retailer });
    if (source === "current") {
      try {
        const location = await getCurrentLocation();
        params.set("latitude", String(location.latitude));
        params.set("longitude", String(location.longitude));
      } catch (locationError) {
        setPending("");
        setError(locationError instanceof Error ? locationError.message : "Unable to use your current location.");
        return;
      }
    }
    const response = await fetch(`/api/account/preferences/stores?${params}`);
    const body = await response.json().catch(() => ({})) as { stores?: Store[]; error?: string };
    setPending("");
    if (!response.ok) { setError(body.error ?? `Unable to find ${retailer} stores.`); return; }
    const stores = body.stores ?? [];
    setResults((current) => ({ ...current, [retailer]: stores }));
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

      {!homePostcode ? <p className={styles.setupNotice}>Add and save a four-digit home postcode above, or explicitly use your current location.</p> : null}
      <div className={styles.retailerList}>
        {retailers.map((retailer) => {
          const isEnabled = enabled.has(retailer);
          const preferred = savedStores.filter((store) => store.retailer === retailer);
          const nearby = results[retailer] ?? [];
          const hasSearched = results[retailer] !== undefined;
          const requiresStore = retailerRequiresStore(retailer);
          return (
            <article className={styles.retailerPanel} key={retailer}>
              <div className={styles.retailerHeading}>
                <div><strong><RetailerLogo retailer={retailer} /></strong><small>{isEnabled ? "Included in your prices" : "Hidden from your prices"}</small></div>
                <label className={styles.switchLabel}>
                  <input checked={isEnabled} onChange={(event) => void toggleRetailer(retailer, event.target.checked)} type="checkbox" />
                  <span>{isEnabled ? "Enabled" : "Disabled"}</span>
                </label>
              </div>

              {isEnabled ? (
                <>
                  {!requiresStore ? <p className={styles.storePrompt}>ALDI catalogue prices are national listings. They are not live store stock or store-specific prices.</p> : preferred.length ? (
                    <div className={styles.savedStores}>
                      {preferred.map((store) => <StoreRow action="remove" key={store.storeId} onAction={() => void removeStore(store)} pending={pending.includes(store.storeId)} store={store} />)}
                    </div>
                  ) : <p className={styles.storePrompt}>No preferred {retailer} store selected. Prices may not reflect your local store.</p>}
                  {requiresStore ? <div className={styles.storeFinderActions}>
                    <button className={styles.secondaryButton} disabled={!homePostcode || pending.startsWith("find-")} onClick={() => void findStores(retailer, "home")} type="button">
                      {pending === `find-home-${retailer}` ? "Finding stores..." : `Find near ${homePostcode || "home"}`}
                    </button>
                    <button className={styles.secondaryButton} disabled={pending.startsWith("find-")} onClick={() => void findStores(retailer, "current")} type="button">
                      {pending === `find-current-${retailer}` ? "Finding location..." : "Use current location"}
                    </button>
                  </div> : null}
                  {requiresStore && nearby.length ? (
                    <div className={styles.storeResults}>
                      <small>{retailer === "Drakes"
                        ? "Nearby stores - select a location with an online price catalogue for price checks"
                        : "Nearby suggestions - choose any store you prefer"}</small>
                      <div className={styles.storeResultsList}>
                        {nearby.map((store) => {
                          const saved = preferred.some((item) => item.storeId === store.storeId);
                          return <StoreRow action={saved ? "saved" : "add"} key={store.storeId} onAction={() => void saveStore(store)} pending={pending.includes(store.storeId)} store={store} />;
                        })}
                      </div>
                    </div>
                  ) : requiresStore && hasSearched ? <p className={styles.storePrompt}>No nearby {retailer} stores were found for that location.</p> : null}
                  {requiresStore ? preferred.map((store) => <StoreMap key={`map-${store.storeId}`} store={store} />) : null}
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
  const unavailableForPrices = action === "add" && store.priceCatalogAvailable === false;
  return (
    <div className={styles.storeRow}>
      <div>
        <strong>{store.name}</strong>
        <small>{store.address || store.postcode || "Address unavailable"}{typeof store.distanceKm === "number" ? ` - ${store.distanceKm.toFixed(1)} km` : ""}</small>
      </div>
      {action === "saved" ? <span className={styles.preferredBadge}>Preferred</span> : unavailableForPrices ? (
        <span className={styles.catalogueUnavailable}>No online price catalogue</span>
      ) : (
        <button disabled={pending} onClick={onAction} type="button">{pending ? "Saving..." : action === "add" ? "Choose" : "Remove"}</button>
      )}
    </div>
  );
}

function StoreMap({ store }: { store: Store }) {
  return <div className={styles.storeMap}>
    <div><strong>{store.name}</strong><small>Interactive map</small></div>
    <div className={styles.storeMapFrame}>
      <iframe allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapUrl(store)} title={`Map for ${store.name}`} />
      <span aria-label={`${store.retailer} store location`} className={styles.storeMapMarker} role="img"><RetailerLogo compact retailer={store.retailer} /></span>
    </div>
  </div>;
}
