"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useBarcodeScanner,
  type BarcodeScanOutcome,
} from "@/hooks/useBarcodeScanner";
import {
  getCurrentLocation,
  type CurrentLocation,
} from "@/lib/current-location";
import { addScannedProductToPantry } from "@/lib/pantry/pantry.actions";
import { addScannedProductToShopping } from "@/lib/shopping/shopping-barcode.actions";
import type { ProductCatalogueItem } from "@/lib/products/product-catalogue.types";
import styles from "./ProductBarcodePicker.module.css";

type BarcodeLookupResponse = {
  found: boolean;
  source?: "local" | "open-food-facts" | "upcitemdb" | "serpapi";
  product?: ProductCatalogueItem;
  error?: string;
};

type ProductBarcodePickerProps = {
  products: ProductCatalogueItem[];
  nameError?: string;
  barcodeError?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  autoOpenScanner?: boolean;
  fullPageScanner?: boolean;
  autoSubmitOnScan?: boolean;
  scanTarget?: "pantry" | "shopping";
  shoppingListId?: string;
};

function normaliseBarcode(value: string) {
  return value.trim();
}

function productByBarcode(products: ProductCatalogueItem[], barcode: string) {
  const normalised = normaliseBarcode(barcode);
  return products.find((product) => product.barcode === normalised) ?? null;
}

function productByName(products: ProductCatalogueItem[], name: string) {
  const normalised = name.trim().toLocaleLowerCase("en-AU");
  if (!normalised) return null;
  return products.find((product) => product.name.toLocaleLowerCase("en-AU") === normalised) ?? null;
}

async function lookupProductByBarcode(
  barcode: string,
  options: {
    currentLocation?: CurrentLocation | null;
    refresh?: boolean;
  } = {},
): Promise<BarcodeLookupResponse> {
  const searchParams = new URLSearchParams();
  if (options.refresh) searchParams.set("refresh", "1");
  if (options.currentLocation) {
    searchParams.set("useCurrentLocation", "1");
    searchParams.set("latitude", String(options.currentLocation.latitude));
    searchParams.set("longitude", String(options.currentLocation.longitude));
    searchParams.set("accuracy", String(options.currentLocation.accuracy));
  }
  const search = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  const response = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}${search}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json() as BarcodeLookupResponse;

  if (!response.ok) {
    throw new Error(payload.error || `Product lookup returned HTTP ${response.status}.`);
  }

  return payload;
}

export function ProductBarcodePicker({
  products,
  nameError,
  barcodeError,
  nameLabel = "Product",
  namePlaceholder = "e.g. Greek yoghurt",
  autoOpenScanner = false,
  fullPageScanner = false,
  autoSubmitOnScan = false,
  scanTarget = "pantry",
  shoppingListId,
}: ProductBarcodePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentLocationRef = useRef<CurrentLocation | null>(null);
  const productsRef = useRef(products);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(autoOpenScanner);
  const [manualTone, setManualTone] = useState<"neutral" | "success" | "error">("neutral");
  const [manualStatus, setManualStatus] = useState("Camera ready when you are.");
  const [locationPending, setLocationPending] = useState(false);
  const [usingCurrentLocation, setUsingCurrentLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState(
    "Using your home or default search area.",
  );

  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase("en-AU");
    const matching = query
      ? products.filter((product) => [product.name, product.brand, product.barcode]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase("en-AU").includes(query)))
      : products;

    return matching.slice(0, 40);
  }, [productQuery, products]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  async function handleDetectedBarcode(barcode: string): Promise<BarcodeScanOutcome> {
    if (barcodeRef.current) barcodeRef.current.value = barcode;

    const knownProduct = productByBarcode(productsRef.current, barcode);
    if (nameRef.current) nameRef.current.value = knownProduct?.name ?? "";

    try {
      const lookup = await lookupProductByBarcode(barcode, {
        currentLocation: currentLocationRef.current,
        refresh: true,
      });

      if (lookup.found && lookup.product) {
        const product = lookup.product;
        productsRef.current = [
          product,
          ...productsRef.current.filter((item) => (
            item.id !== product.id && item.barcode !== product.barcode
          )),
        ];
        if (nameRef.current) nameRef.current.value = product.name;

        if (autoSubmitOnScan) {
          const saveResult = scanTarget === "shopping" && shoppingListId
            ? await addScannedProductToShopping(shoppingListId, product.name, barcode)
            : await addScannedProductToPantry(product.name, barcode);
          const targetLabel = scanTarget === "shopping" ? "Shopping" : "Pantry";
          if (saveResult.status !== "success") {
            return {
              tone: "error",
              message: saveResult.message || `${product.name} could not be added to ${targetLabel}.`,
            };
          }

          return {
            tone: "success",
            message: `${product.name} added to ${targetLabel}. Present the next barcode.`,
          };
        }

        return {
          tone: "success",
          message: `${product.name}${product.brand ? ` by ${product.brand}` : ""} recognised. The camera remains live.`,
        };
      }

      nameRef.current?.focus();
      return {
        tone: "neutral",
        message: `Barcode ${barcode} was not found. Enter the product name once and Food will remember it.`,
      };
    } catch (error) {
      console.error("Unable to look up scanned product", error);
      nameRef.current?.focus();
      return {
        tone: "error",
        message: `${error instanceof Error ? error.message : "Product lookup failed."} Enter the product name manually and Food will remember it.`,
      };
    }
  }

  const scanner = useBarcodeScanner({
    enabled: scannerOpen,
    videoRef,
    onDetected: handleDetectedBarcode,
    duplicateWindowMs: 1_500,
    successDurationMs: 1_000,
  });
  const scanTone = scannerOpen
    ? scanner.phase === "success"
      ? "success"
      : scanner.phase === "error"
        ? "error"
        : "neutral"
    : manualTone;
  const scanStatus = scannerOpen ? scanner.status : manualStatus;

  useEffect(() => {
    const form = containerRef.current?.closest("form");
    if (!form) return;

    const handleReset = () => {
      setManualTone("neutral");
      setManualStatus("Camera ready when you are.");
    };

    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [scannerOpen]);

  function selectProduct(product: ProductCatalogueItem) {
    if (nameRef.current) nameRef.current.value = product.name;
    if (barcodeRef.current) barcodeRef.current.value = product.barcode ?? "";
    setManualTone("success");
    setManualStatus(`${product.name} selected${product.barcode ? " with its saved barcode" : ""}.`);
    setCatalogueOpen(false);
  }

  function handleProductNameChange(value: string) {
    const product = productByName(products, value);
    if (product && barcodeRef.current) barcodeRef.current.value = product.barcode ?? "";
  }

  function handleBarcodeChange(value: string) {
    const product = productByBarcode(productsRef.current, value);
    if (product && nameRef.current) {
      nameRef.current.value = product.name;
      setManualTone("success");
      setManualStatus(`${product.name} recognised from its saved barcode.`);
    }
  }

  function toggleCatalogue() {
    setScannerOpen(false);
    setCatalogueOpen((open) => !open);
  }

  function openScanner() {
    setCatalogueOpen(false);
    setScannerOpen(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      setManualTone("error");
      setManualStatus("This browser cannot access the camera. Enter the barcode manually instead.");
      return;
    }
  }

  async function toggleCurrentLocation() {
    if (currentLocationRef.current) {
      currentLocationRef.current = null;
      setUsingCurrentLocation(false);
      setLocationStatus("Using your home or default search area.");
      return;
    }

    setLocationPending(true);
    setLocationStatus("Waiting for device location…");

    try {
      const location = await getCurrentLocation();
      currentLocationRef.current = location;
      setUsingCurrentLocation(true);
      setLocationStatus(
        `Using your current location for local lookups (accuracy about ${Math.round(location.accuracy)} m).`,
      );
    } catch (error) {
      setLocationStatus(
        error instanceof Error
          ? error.message
          : "Your current location could not be determined.",
      );
    } finally {
      setLocationPending(false);
    }
  }

  return (
    <div className={`${styles.picker} ${fullPageScanner ? styles.fullPage : ""}`} ref={containerRef}>
      <datalist id="food-product-catalogue">
        {products.map((product) => (
          <option
            key={product.id}
            label={[product.brand, product.barcode].filter(Boolean).join(" · ")}
            value={product.name}
          />
        ))}
      </datalist>

      <div className={styles.productRow}>
        <label className="field">
          <span>{nameLabel}</span>
          <input
            aria-invalid={Boolean(nameError)}
            autoComplete="off"
            list="food-product-catalogue"
            maxLength={100}
            minLength={2}
            name="name"
            onChange={(event) => handleProductNameChange(event.target.value)}
            placeholder={namePlaceholder}
            ref={nameRef}
            required
          />
          {nameError ? <small className="field-error">{nameError}</small> : null}
        </label>

        <label className="field">
          <span>Barcode <small>(optional)</small></span>
          <input
            aria-invalid={Boolean(barcodeError)}
            autoComplete="off"
            maxLength={80}
            name="barcode"
            onChange={(event) => handleBarcodeChange(event.target.value)}
            placeholder="Scan or enter code"
            ref={barcodeRef}
          />
          {barcodeError ? <small className="field-error">{barcodeError}</small> : null}
        </label>
      </div>

      <div className={styles.pickerActions}>
        <button className="secondary-button" onClick={toggleCatalogue} type="button">
          {catalogueOpen ? "Hide products" : "Show products"}
        </button>
        {scannerOpen ? (
          <button className="secondary-button" onClick={() => setScannerOpen(false)} type="button">Stop camera</button>
        ) : (
          <button className="secondary-button" onClick={openScanner} type="button">Scan barcode</button>
        )}
      </div>

      {catalogueOpen ? (
        <section className={styles.catalogue} aria-label="Saved products">
          <div className={styles.catalogueHeading}>
            <div>
              <strong>Saved products</strong>
              <span>Select a known product or search by name, brand or barcode.</span>
            </div>
            <span className="badge neutral">{products.length}</span>
          </div>
          <label className="field">
            <span>Find a product</span>
            <input
              autoComplete="off"
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Search products"
              type="search"
              value={productQuery}
            />
          </label>
          {products.length === 0 ? (
            <p className={styles.catalogueEmpty}>No products have been saved yet. Scan a barcode or enter the first product manually.</p>
          ) : visibleProducts.length === 0 ? (
            <p className={styles.catalogueEmpty}>No saved products match this search.</p>
          ) : (
            <div className={styles.productList}>
              {visibleProducts.map((product) => (
                <button className={styles.productOption} key={product.id} onClick={() => selectProduct(product)} type="button">
                  <span><strong>{product.name}</strong><small>{product.brand || "Brand not recorded"}</small></span>
                  <span>{product.barcode || "No barcode"}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {scannerOpen ? (
        <section className={styles.scanner} aria-label="Live barcode scanner">
          <div className={styles.scannerHeading}>
            <div>
              <strong>Live barcode scanner</strong>
              <span>No image is captured or uploaded. New barcodes are checked against external product catalogues.</span>
            </div>
            <span className="badge neutral">Rear camera</span>
          </div>
          <div className={styles.lookupLocation}>
            <span>{locationStatus}</span>
            <button
              className="secondary-button"
              disabled={locationPending}
              onClick={() => void toggleCurrentLocation()}
              type="button"
            >
              {locationPending
                ? "Finding location…"
                : usingCurrentLocation
                  ? "Use home instead"
                  : "Use current location"}
            </button>
          </div>
          <div className={styles.videoFrame}>
            <video aria-label="Live camera preview" autoPlay data-food-scanner-video muted playsInline ref={videoRef} />
            <div className={styles.scanGuide} />
          </div>
          <p className={`${styles.scanStatus} ${styles[scanTone]}`} aria-live="polite">{scanStatus}</p>
          {scanner.phase === "success" ? (
            <div className={styles.successOverlay} role="status">
              <span aria-hidden="true">✓</span>
              <strong>{scanStatus}</strong>
            </div>
          ) : null}
          <p className={styles.cameraNote}>After adding an item, move it away from the camera and present the next barcode. The scanner will continue running.</p>
        </section>
      ) : null}
    </div>
  );
}
