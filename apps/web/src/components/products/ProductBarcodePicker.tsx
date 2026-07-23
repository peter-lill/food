"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProductCatalogueItem } from "@/lib/products/product-catalogue.types";
import styles from "./ProductBarcodePicker.module.css";

type DetectedBarcode = {
  rawValue: string;
};

type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

type BarcodeLookupResponse = {
  found: boolean;
  source?: "local" | "open-food-facts";
  product?: ProductCatalogueItem;
  error?: string;
};

type ScanTone = "neutral" | "success" | "error";

type ProductBarcodePickerProps = {
  products: ProductCatalogueItem[];
  nameError?: string;
  barcodeError?: string;
  nameLabel?: string;
  namePlaceholder?: string;
};

const preferredFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

function getBarcodeDetector() {
  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

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

async function lookupProductByBarcode(barcode: string): Promise<BarcodeLookupResponse> {
  const response = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}`, {
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
}: ProductBarcodePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastBarcodeRef = useRef("");
  const productsRef = useRef(products);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanTone, setScanTone] = useState<ScanTone>("neutral");
  const [scanStatus, setScanStatus] = useState("Camera ready when you are.");

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

  useEffect(() => {
    const form = containerRef.current?.closest("form");
    if (!form) return;

    const handleReset = () => {
      if (!scannerOpen) lastBarcodeRef.current = "";
      setScanTone("neutral");
      setScanStatus(scannerOpen
        ? "Item added. Move it away from the camera, then present the next barcode."
        : "Camera ready when you are.");
    };

    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [scannerOpen]);

  useEffect(() => {
    if (!scannerOpen) return;

    const Detector = getBarcodeDetector();
    const mediaDevices = navigator.mediaDevices;
    if (!Detector || !mediaDevices?.getUserMedia) return;

    const ActiveDetector = Detector;
    const activeMediaDevices = mediaDevices;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let videoElement: HTMLVideoElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let emptyPasses = 0;

    async function startScanner() {
      try {
        const supportedFormats = ActiveDetector.getSupportedFormats
          ? await ActiveDetector.getSupportedFormats()
          : preferredFormats;
        const formats = preferredFormats.filter((format) => supportedFormats.includes(format));
        const detector = new ActiveDetector(formats.length > 0 ? { formats } : undefined);

        stream = await activeMediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        const activeVideo = videoRef.current;
        if (cancelled || !activeVideo) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoElement = activeVideo;
        activeVideo.srcObject = stream;
        await activeVideo.play();
        setScanTone("neutral");
        setScanStatus("Camera is live. Hold a barcode inside the frame.");

        const scan = async () => {
          if (cancelled) return;

          try {
            const results = activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
              ? await detector.detect(activeVideo)
              : [];
            const barcode = normaliseBarcode(results[0]?.rawValue ?? "");

            if (!barcode) {
              emptyPasses += 1;
              if (emptyPasses >= 6) lastBarcodeRef.current = "";
            } else {
              emptyPasses = 0;

              if (barcode !== lastBarcodeRef.current) {
                lastBarcodeRef.current = barcode;
                if (barcodeRef.current) barcodeRef.current.value = barcode;

                const knownProduct = productByBarcode(productsRef.current, barcode);

                if (knownProduct) {
                  if (nameRef.current) nameRef.current.value = knownProduct.name;
                  setScanTone("success");
                  setScanStatus(`${knownProduct.name} recognised. The camera remains live for the next item.`);
                } else {
                  if (nameRef.current) nameRef.current.value = "";
                  setScanTone("neutral");
                  setScanStatus(`Looking up barcode ${barcode}…`);

                  try {
                    const lookup = await lookupProductByBarcode(barcode);
                    if (cancelled) return;

                    if (lookup.found && lookup.product) {
                      const product = lookup.product;
                      productsRef.current = [
                        product,
                        ...productsRef.current.filter((item) => (
                          item.id !== product.id && item.barcode !== product.barcode
                        )),
                      ];
                      if (nameRef.current) nameRef.current.value = product.name;
                      setScanTone("success");
                      setScanStatus(
                        `${product.name}${product.brand ? ` by ${product.brand}` : ""} found via Open Food Facts. The camera remains live.`,
                      );
                    } else {
                      setScanTone("neutral");
                      setScanStatus(`Barcode ${barcode} was not found. Enter the product name once and Food will remember it.`);
                      nameRef.current?.focus();
                    }
                  } catch (error) {
                    if (cancelled) return;
                    const message = error instanceof Error ? error.message : "Product lookup failed.";
                    console.error("Unable to look up scanned product", error);
                    setScanTone("error");
                    setScanStatus(`${message} Enter the product name manually and Food will remember it.`);
                    nameRef.current?.focus();
                  }
                }

                navigator.vibrate?.(70);
              }
            }
          } catch (error) {
            console.error("Unable to detect barcode", error);
          }

          if (!cancelled) timer = setTimeout(scan, 240);
        };

        timer = setTimeout(scan, 240);
      } catch (error) {
        console.error("Unable to start barcode scanner", error);
        setScanTone("error");
        setScanStatus("Camera access failed. Check browser permission for food.coffeehq.coffee or enter the barcode manually.");
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [scannerOpen]);

  function selectProduct(product: ProductCatalogueItem) {
    if (nameRef.current) nameRef.current.value = product.name;
    if (barcodeRef.current) barcodeRef.current.value = product.barcode ?? "";
    setScanTone("success");
    setScanStatus(`${product.name} selected${product.barcode ? " with its saved barcode" : ""}.`);
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
      setScanTone("success");
      setScanStatus(`${product.name} recognised from its saved barcode.`);
    }
  }

  function toggleCatalogue() {
    setScannerOpen(false);
    setCatalogueOpen((open) => !open);
  }

  function openScanner() {
    setCatalogueOpen(false);
    setScannerOpen(true);

    if (!getBarcodeDetector()) {
      setScanTone("error");
      setScanStatus("Live barcode detection is not supported by this browser. Enter the barcode manually instead.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanTone("error");
      setScanStatus("This browser cannot access the camera. Enter the barcode manually instead.");
      return;
    }

    setScanTone("neutral");
    setScanStatus("Starting the rear camera…");
  }

  return (
    <div className={styles.picker} ref={containerRef}>
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
              <span>No image is captured or uploaded. New barcodes are looked up using Open Food Facts.</span>
            </div>
            <span className="badge neutral">Rear camera</span>
          </div>
          <div className={styles.videoFrame}>
            <video aria-label="Live camera preview" autoPlay muted playsInline ref={videoRef} />
            <div className={styles.scanGuide} />
          </div>
          <p className={`${styles.scanStatus} ${styles[scanTone]}`} aria-live="polite">{scanStatus}</p>
          <p className={styles.cameraNote}>After adding an item, move it away from the camera and present the next barcode. The scanner will continue running.</p>
        </section>
      ) : null}
    </div>
  );
}
