"use client";

import { useEffect, useRef, useState } from "react";
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

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

type ScanTone = "neutral" | "success" | "error";

type ProductBarcodePickerProps = {
  products: ProductCatalogueItem[];
  nameError?: string;
  barcodeError?: string;
  nameLabel?: string;
  namePlaceholder?: string;
};

const preferredFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanTone, setScanTone] = useState<ScanTone>("neutral");
  const [scanStatus, setScanStatus] = useState("Camera ready when you are.");

  useEffect(() => {
    const form = containerRef.current?.closest("form");
    if (!form) return;

    const handleReset = () => {
      lastBarcodeRef.current = "";
      setScanTone("neutral");
      setScanStatus(scannerOpen ? "Camera is live. Scan the next barcode." : "Camera ready when you are.");
    };

    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [scannerOpen]);

  useEffect(() => {
    if (!scannerOpen) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let emptyPasses = 0;

    async function startScanner() {
      const Detector = window.BarcodeDetector;

      if (!Detector) {
        setScanTone("error");
        setScanStatus("Live barcode detection is not supported by this browser. Enter the barcode manually instead.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setScanTone("error");
        setScanStatus("This browser cannot access the camera. Enter the barcode manually instead.");
        return;
      }

      try {
        const supportedFormats = Detector.getSupportedFormats
          ? await Detector.getSupportedFormats()
          : preferredFormats;
        const formats = preferredFormats.filter((format) => supportedFormats.includes(format));
        const detector = new Detector(formats.length > 0 ? { formats } : undefined);

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanTone("neutral");
        setScanStatus("Camera is live. Hold a barcode inside the frame.");

        const scan = async () => {
          if (cancelled || !videoRef.current) return;

          try {
            const results = videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
              ? await detector.detect(videoRef.current)
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

                const knownProduct = productByBarcode(products, barcode);
                if (knownProduct && nameRef.current) {
                  nameRef.current.value = knownProduct.name;
                  setScanTone("success");
                  setScanStatus(`${knownProduct.name} recognised. The camera remains live for the next item.`);
                } else {
                  setScanTone("neutral");
                  setScanStatus(`Barcode ${barcode} is new. Enter the product name once and Food will remember it.`);
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
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [products, scannerOpen]);

  function handleProductNameChange(value: string) {
    const product = productByName(products, value);
    if (product?.barcode && barcodeRef.current && !barcodeRef.current.value.trim()) {
      barcodeRef.current.value = product.barcode;
    }
  }

  function handleBarcodeChange(value: string) {
    const product = productByBarcode(products, value);
    if (product && nameRef.current) {
      nameRef.current.value = product.name;
      setScanTone("success");
      setScanStatus(`${product.name} recognised from its saved barcode.`);
    }
  }

  function openScanner() {
    setScanTone("neutral");
    setScanStatus("Starting the rear camera…");
    setScannerOpen(true);
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

        {scannerOpen ? (
          <button className={`secondary-button ${styles.scanButton}`} onClick={() => setScannerOpen(false)} type="button">Stop camera</button>
        ) : (
          <button className={`secondary-button ${styles.scanButton}`} onClick={openScanner} type="button">Scan barcode</button>
        )}
      </div>

      {scannerOpen ? (
        <section className={styles.scanner} aria-label="Live barcode scanner">
          <div className={styles.scannerHeading}>
            <div>
              <strong>Live barcode scanner</strong>
              <span>No image is captured or uploaded. The camera remains live until you stop it.</span>
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
