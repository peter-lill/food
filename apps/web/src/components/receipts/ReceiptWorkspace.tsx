"use client";

import { parseReceipt } from "@/lib/receipts/engine/parser";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createReceiptImport } from "@/lib/receipts/receipt.actions";
import {
  chooseReceiptCandidate,
  needsReceiptFallback,
  type ReceiptOcrCandidate,
} from "@/lib/receipts/receipt-ocr-selection";
import {
  initialReceiptActionState,
  type ReceiptActionState,
  type ReceiptStatusValue,
  type ReceiptSummary,
} from "@/lib/receipts/receipt.types";
import styles from "./ReceiptWorkspace.module.css";
import { takeStagedReceiptCapture } from "@/lib/receipts/staged-receipt-capture";

const statusLabels: Record<ReceiptStatusValue, string> = {
  DRAFT: "Needs review",
  IMPORTED: "Imported",
  CANCELLED: "Cancelled",
};
const retailerNames = ["Woolworths", "Coles", "ALDI", "IGA", "Drakes", "Costco"];
type DraftItem = { id: string; name: string; quantity: string; price: string };

function formatDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}
function formatMoney(value: number | null) {
  return value === null ? "Total not recorded" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}
function FieldError({ state, field }: { state: ReceiptActionState; field: string }) {
  const message = state.fieldErrors?.[field];
  return message ? <small className="field-error">{message}</small> : null;
}
function CreateButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={disabled || pending}>{pending ? "Creating review…" : "Review and import receipt"}</button>;
}
function ReceiptCard({ receipt }: { receipt: ReceiptSummary }) {
  const progress = receipt.itemCount === 0 ? 0 : Math.round((receipt.reviewedCount / receipt.itemCount) * 100);
  return (
    <Link className="receipt-card" href={`/receipts/${receipt.id}`}>
      <div className="receipt-card-heading">
        <div><strong>{receipt.retailer ?? "Unknown retailer"}</strong><span>{receipt.purchasedAt ? formatDate(receipt.purchasedAt) : "Date not recorded"}</span></div>
        <span className={`badge receipt-status ${receipt.status.toLowerCase()}`}>{statusLabels[receipt.status]}</span>
      </div>
      <div className="receipt-card-metrics">
        <span><strong>{formatMoney(receipt.total)}</strong><small>Receipt total</small></span>
        <span><strong>{receipt.itemCount}</strong><small>Lines</small></span>
        <span><strong>{receipt.foodCount}</strong><small>Food items</small></span>
      </div>
      {receipt.status === "DRAFT" ? <div className="receipt-review-progress"><div><span>Review progress</span><strong>{receipt.reviewedCount}/{receipt.itemCount}</strong></div><div className="progress"><span style={{ width: `${progress}%` }} /></div></div> : null}
    </Link>
  );
}
function inferRetailer(text: string) {
  const lower = text.toLocaleLowerCase("en-AU");
  return retailerNames.find((name) => lower.includes(name.toLocaleLowerCase("en-AU"))) ?? "";
}
function inferTotal(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const totalLine = [...lines].reverse().find((line) => /\b(?:grand\s+total|amount\s+due|total)\b/i.test(line) && !/\b(?:gst|tax|saving|discount)\b/i.test(line));
  const match = totalLine?.match(/\$?\s*(\d+[.,]\d{2})\b/);
  return match ? match[1].replace(",", ".") : "";
}
function inferDate(text: string) {
  const match = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (!match) return new Date().toISOString().slice(0, 10);
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}
function makeItem(name = "", quantity = "1", price = ""): DraftItem {
  return { id: crypto.randomUUID(), name, quantity, price };
}
async function loadImage(file: File): Promise<HTMLImageElement> {
  const source = URL.createObjectURL(file);
  try {
    const image = new Image(); image.decoding = "async"; image.src = source; await image.decode(); return image;
  } finally { URL.revokeObjectURL(source); }
}
async function prepareReceiptImage(file: File): Promise<Blob> {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(3, Math.max(1, 3200 / longestSide));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not prepare the receipt image.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height); const data = pixels.data;
  const histogram = new Uint32Array(256);
  for (let index = 0; index < data.length; index += 4) {
    const grey = data[index] * .299 + data[index + 1] * .587 + data[index + 2] * .114;
    histogram[Math.round(grey)] += 1;
  }
  const pixelCount = width * height;
  const percentile = (target: number) => {
    let seen = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      seen += histogram[value];
      if (seen >= pixelCount * target) return value;
    }
    return 255;
  };
  const shadow = percentile(.02);
  const highlight = Math.max(shadow + 24, percentile(.98));
  for (let index = 0; index < data.length; index += 4) {
    const grey = data[index] * .299 + data[index + 1] * .587 + data[index + 2] * .114;
    const normalised = Math.max(0, Math.min(255, ((grey - shadow) * 255) / (highlight - shadow)));
    data[index] = normalised; data[index + 1] = normalised; data[index + 2] = normalised;
  }
  context.putImageData(pixels, 0, 0);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The prepared receipt image could not be created.")), "image/jpeg", .94));
}

export function ReceiptWorkspace({ receipts, loadError, loadStagedCapture = false }: { receipts: ReceiptSummary[]; loadError: boolean; loadStagedCapture?: boolean }) {
  const [state, action] = useActionState(createReceiptImport, initialReceiptActionState);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const savedPhotoInputRef = useRef<HTMLInputElement>(null);
  const stagedCaptureStartedRef = useRef(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState("Take a photo or choose a saved receipt image.");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [retailer, setRetailer] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [total, setTotal] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  const serialisedLines = useMemo(() => items.filter((item) => item.name.trim()).map((item) => `${item.name.trim()} | ${item.quantity || "1"} | ${item.price || ""}`).join("\n"), [items]);

  function updateItem(id: string, field: keyof Omit<DraftItem, "id">, value: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }
  async function processReceipt(file: File) {
    setLastFile(file);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file)); setOcrBusy(true); setOcrError(null); setOcrProgress(2); setOcrStatus("Preparing the receipt image…");
    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
    try {
      const prepared = await prepareReceiptImage(file);
      setOcrProgress(10); setOcrStatus("Loading receipt recognition…");
      const { createWorker, PSM } = await import("tesseract.js");
      let passStart = 18;
      let passRange = 40;
      worker = await createWorker("eng", undefined, { logger(message) {
        if (typeof message.progress === "number") {
          const base = message.status === "recognizing text" ? passStart : 10;
          const range = message.status === "recognizing text" ? passRange : 8;
          setOcrProgress(Math.min(99, Math.round(base + message.progress * range)));
        }
      }});
      const candidates: ReceiptOcrCandidate[] = [];
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1", user_defined_dpi: "300" });
      setOcrStatus("Reading the receipt as a structured list…");
      const structuredResult = await worker.recognize(prepared);
      const structuredText = (structuredResult.data.text ?? "").trim();
      if (structuredText) {
        candidates.push({
          ocrConfidence: structuredResult.data.confidence ?? 0,
          parsed: parseReceipt(structuredText),
          pass: "structured",
          text: structuredText,
        });
      }

      if (!candidates.length || needsReceiptFallback(candidates[0])) {
        passStart = 58;
        passRange = 40;
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1", user_defined_dpi: "300" });
        setOcrStatus("Checking faint and separated receipt lines…");
        const sparseResult = await worker.recognize(prepared);
        const sparseText = (sparseResult.data.text ?? "").trim();
        if (sparseText) {
          candidates.push({
            ocrConfidence: sparseResult.data.confidence ?? 0,
            parsed: parseReceipt(sparseText),
            pass: "sparse",
            text: sparseText,
          });
        }
      }

      const best = chooseReceiptCandidate(candidates);
      if (!best) throw new Error("No readable text was detected. Try a clearer saved image or retake the photo closer and without glare.");
      const parsed = best.parsed;
      const extracted = parsed.items.map((item) => makeItem(item.description, String(item.quantity), item.price === null ? "" : item.price.toFixed(2)));
      setRetailer(parsed.retailer || inferRetailer(best.text));
      setPurchasedAt(parsed.purchasedAt ?? inferDate(best.text));
      setTotal(parsed.total === null ? inferTotal(best.text) : parsed.total.toFixed(2));
      setItems(extracted.length ? extracted : [makeItem()]);
      setOcrProgress(100);
      const warning = parsed.warnings[0];
      const unreliable = needsReceiptFallback(best);
      setOcrStatus(extracted.length
        ? warning || unreliable
          ? `Found ${extracted.length} likely purchase ${extracted.length === 1 ? "line" : "lines"}, but the scan needs careful review.${warning ? ` ${warning}` : " Some receipt details could not be reconciled."}`
          : `Found ${extracted.length} purchase ${extracted.length === 1 ? "line" : "lines"} and reconciled them with the receipt. Check the review below.`
        : "The receipt header was read, but product lines need confirmation. Add them below.");
    } catch (error) {
      console.error("Unable to OCR receipt", error);
      setOcrError(error instanceof Error ? error.message : "The receipt could not be read."); setOcrStatus("Receipt reading failed. Choose another image or retake the photo."); setOcrProgress(0);
    } finally { await worker?.terminate().catch(() => undefined); setOcrBusy(false); }
  }
  async function handleReceiptImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setOcrError("Choose a JPG, PNG, HEIC, WebP or other receipt image."); return; }
    await processReceipt(file);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (savedPhotoInputRef.current) savedPhotoInputRef.current.value = "";
  }

  useEffect(() => {
    if (!loadStagedCapture || stagedCaptureStartedRef.current) return;
    stagedCaptureStartedRef.current = true;
    let cancelled = false;
    void takeStagedReceiptCapture()
      .then((file) => {
        if (!cancelled && file) void processReceipt(file);
      })
      .catch((error) => {
        console.error("Unable to load staged receipt capture", error);
        if (!cancelled) setOcrError("The captured receipt photo could not be loaded. Take another photo or choose a saved image.");
      });
    return () => { cancelled = true; };
    // The capture is consumed once; processReceipt intentionally does not retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStagedCapture]);

  const ready = retailer.trim().length >= 2 && Boolean(purchasedAt) && Number(total) >= 0 && items.some((item) => item.name.trim());
  return (
    <div className={styles.workspace}>
      <section className={`card ${styles.captureCard}`}>
        <div className={`${styles.captureStage} ${imageUrl ? styles.previewStage : styles.emptyStage}`}>
          {imageUrl ? <img className={styles.receiptPreview} alt="Receipt awaiting review" src={imageUrl} /> : <div className={styles.emptyCapture}><strong>Scan a receipt</strong><p>Take a clear photo now or choose one already saved on your device.</p></div>}
          {ocrBusy ? <div className={styles.processing} role="status"><strong>{ocrStatus}</strong><progress max="100" value={ocrProgress}>{ocrProgress}%</progress></div> : null}
          <div className={styles.captureActions}>
            <button className={styles.captureButton} disabled={ocrBusy} onClick={() => cameraInputRef.current?.click()} type="button">{imageUrl ? "Retake photo" : "Take photo"}</button>
            <button className={styles.secondaryCaptureButton} disabled={ocrBusy} onClick={() => savedPhotoInputRef.current?.click()} type="button">Choose saved photo</button>
            {imageUrl && lastFile ? <button className={styles.secondaryCaptureButton} disabled={ocrBusy} onClick={() => void processReceipt(lastFile)} type="button">Read again</button> : null}
          </div>
          <input accept="image/*" capture="environment" disabled={ocrBusy} onChange={(event) => void handleReceiptImage(event.currentTarget.files?.[0] ?? null)} ref={cameraInputRef} hidden type="file" />
          <input accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={ocrBusy} onChange={(event) => void handleReceiptImage(event.currentTarget.files?.[0] ?? null)} ref={savedPhotoInputRef} hidden type="file" />
        </div>

        {ocrError ? <div className={styles.errorBox} role="alert"><strong>Receipt could not be read.</strong><div>{ocrError}</div></div> : null}
        {(imageUrl || items.length > 0) ? <form action={action} className={styles.reviewPanel}>
          <div className={styles.reviewHeading}><div><p className="eyebrow">REVIEW</p><h2>Check your receipt</h2><p>{ocrStatus}</p></div><span className="badge neutral">{items.filter((item) => item.name.trim()).length} items</span></div>
          <div className={styles.metaGrid}>
            <label className="field"><span>Retailer</span><input name="retailer" onChange={(event) => setRetailer(event.target.value)} placeholder="e.g. Woolworths" required value={retailer} /><FieldError state={state} field="retailer" /></label>
            <label className="field"><span>Purchase date</span><input name="purchasedAt" onChange={(event) => setPurchasedAt(event.target.value)} required type="date" value={purchasedAt} /><FieldError state={state} field="purchasedAt" /></label>
            <label className={`field ${styles.full}`}><span>Receipt total</span><input min="0" name="total" onChange={(event) => setTotal(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={total} /><FieldError state={state} field="total" /></label>
          </div>
          <div className={styles.itemsHeader}><h3>Purchase lines</h3><button className="secondary-button" onClick={() => setItems((current) => [...current, makeItem()])} type="button">Add item</button></div>
          <div className={styles.itemList}>
            {items.length ? items.map((item, index) => <div className={styles.itemRow} key={item.id}><label><span>Item</span><input aria-label={`Item ${index + 1} description`} onChange={(event) => updateItem(item.id, "name", event.target.value)} value={item.name} /></label><label><span>Qty</span><input min="0" onChange={(event) => updateItem(item.id, "quantity", event.target.value)} step="0.01" type="number" value={item.quantity} /></label><label><span>Price</span><input min="0" onChange={(event) => updateItem(item.id, "price", event.target.value)} step="0.01" type="number" value={item.price} /></label><button aria-label={`Remove ${item.name || `item ${index + 1}`}`} className={styles.removeButton} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} type="button">×</button></div>) : <div className={styles.emptyItems}>No product lines yet. Add them manually if the receipt was not readable.</div>}
          </div>
          <input name="lines" type="hidden" value={serialisedLines} />
          <CreateButton disabled={!ready} />
          {state.message ? <p className={state.ok ? "success-message" : "field-error"}>{state.message}</p> : null}
        </form> : null}
      </section>

      <section className={`card ${styles.historyCard}`}>
        <div className={styles.historyContent}>
          <p className="eyebrow">RECEIPT HISTORY</p>
          <h2>Previous receipts</h2>
          {loadError ? <p className="field-error">Receipts could not be loaded.</p> : receipts.length ? <div className="receipt-list">{receipts.map((receipt) => <ReceiptCard key={receipt.id} receipt={receipt} />)}</div> : <p className="subtle">No receipts have been imported yet.</p>}
        </div>
      </section>
    </div>
  );
}
