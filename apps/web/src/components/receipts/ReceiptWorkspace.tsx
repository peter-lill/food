"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createReceiptImport } from "@/lib/receipts/receipt.actions";
import {
  initialReceiptActionState,
  type ReceiptActionState,
  type ReceiptStatusValue,
  type ReceiptSummary,
} from "@/lib/receipts/receipt.types";

const statusLabels: Record<ReceiptStatusValue, string> = {
  DRAFT: "Needs review",
  IMPORTED: "Imported",
  CANCELLED: "Cancelled",
};

const retailerNames = ["Woolworths", "Coles", "ALDI", "IGA", "Drakes", "Costco"];

type ExtractedReceiptLine = {
  name: string;
  quantity: number;
  price: string;
};

function formatDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMoney(value: number | null) {
  return value === null
    ? "Total not recorded"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function FieldError({ state, field }: { state: ReceiptActionState; field: string }) {
  const message = state.fieldErrors?.[field];
  return message ? <small className="field-error">{message}</small> : null;
}

function CreateButton() {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending}>{pending ? "Creating…" : "Review extracted items"}</button>;
}

function ReceiptCard({ receipt }: { receipt: ReceiptSummary }) {
  const progress = receipt.itemCount === 0 ? 0 : Math.round((receipt.reviewedCount / receipt.itemCount) * 100);

  return (
    <Link className="receipt-card" href={`/receipts/${receipt.id}`}>
      <div className="receipt-card-heading">
        <div>
          <strong>{receipt.retailer ?? "Unknown retailer"}</strong>
          <span>{receipt.purchasedAt ? formatDate(receipt.purchasedAt) : "Date not recorded"}</span>
        </div>
        <span className={`badge receipt-status ${receipt.status.toLowerCase()}`}>{statusLabels[receipt.status]}</span>
      </div>
      <div className="receipt-card-metrics">
        <span><strong>{formatMoney(receipt.total)}</strong><small>Receipt total</small></span>
        <span><strong>{receipt.itemCount}</strong><small>Lines</small></span>
        <span><strong>{receipt.foodCount}</strong><small>Food items</small></span>
      </div>
      {receipt.status === "DRAFT" ? (
        <div className="receipt-review-progress">
          <div><span>Review progress</span><strong>{receipt.reviewedCount}/{receipt.itemCount}</strong></div>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
      ) : null}
    </Link>
  );
}

function inferRetailer(text: string) {
  const lower = text.toLocaleLowerCase("en-AU");
  return retailerNames.find((name) => lower.includes(name.toLocaleLowerCase("en-AU"))) ?? "";
}

function inferTotal(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const totalLine = [...lines].reverse().find((line) => /\b(?:grand\s+total|amount\s+due|total)\b/i.test(line));
  const match = totalLine?.match(/\$?\s*(\d+[.,]\d{2})\b/);
  return match ? match[1].replace(",", ".") : "";
}

function inferDate(text: string) {
  const match = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (!match) return new Date().toISOString().slice(0, 10);
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function cleanReceiptName(value: string) {
  return value
    .replace(/^\s*\d+\s*[xX]\s*/, "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/\s+/g, " ")
    .replace(/[|{}\[\]\\]/g, "")
    .trim();
}

function isReceiptMetadata(value: string) {
  return /^(subtotal|total|amount due|gst|tax|change|cash|eftpos|visa|mastercard|saving|you saved|receipt|abn|thank|www\.|tel|date|time|store|served by|operator|loyalty|flybuys|everyday rewards)/i.test(value);
}

function extractReceiptLines(text: string): ExtractedReceiptLine[] {
  const physicalLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[‐‑–—]/g, "-").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const extracted: ExtractedReceiptLine[] = [];
  let pendingName = "";

  for (const line of physicalLines) {
    if (isReceiptMetadata(line)) {
      pendingName = "";
      continue;
    }

    const sameLine = line.match(/^(.*?)(?:\s+|\s*\$)(-?\d+[.,]\d{2})\s*$/);
    if (sameLine) {
      const name = cleanReceiptName(`${pendingName} ${sameLine[1]}`);
      const price = sameLine[2].replace(",", ".");
      pendingName = "";
      if (name.length >= 2 && /[A-Za-z]/.test(name) && Number(price) > 0) {
        const quantityMatch = name.match(/^(\d+)\s*[xX]\s+(.+)$/);
        extracted.push({
          name: quantityMatch ? quantityMatch[2] : name,
          quantity: quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1,
          price,
        });
      }
      continue;
    }

    const priceOnly = line.match(/^\$?\s*(-?\d+[.,]\d{2})$/);
    if (priceOnly && pendingName) {
      const name = cleanReceiptName(pendingName);
      const price = priceOnly[1].replace(",", ".");
      pendingName = "";
      if (name.length >= 2 && /[A-Za-z]/.test(name) && Number(price) > 0) {
        extracted.push({ name, quantity: 1, price });
      }
      continue;
    }

    if (/^[A-Za-z0-9][A-Za-z0-9 &'().,+\-/]{1,80}$/.test(line) && !isReceiptMetadata(line)) {
      pendingName = pendingName ? `${pendingName} ${line}` : line;
      if (pendingName.length > 100) pendingName = line;
    }
  }

  const unique = new Map<string, ExtractedReceiptLine>();
  for (const item of extracted) {
    const key = `${item.name.toLocaleLowerCase("en-AU")}|${item.price}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, 120);
}

function serialiseReceiptLines(items: ExtractedReceiptLine[]) {
  return items.map((item) => `${item.name} | ${item.quantity} | ${item.price}`).join("\n");
}

async function loadImage(file: File) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the HTMLImageElement path.
    }
  }

  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function prepareReceiptImage(file: File): Promise<Blob> {
  const image = await loadImage(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;

  // Receipt text accuracy depends on character width, not the image's longest side.
  // A tall phone photo can be 4000px high but only 700px wide, which previously
  // left the text too small for OCR. Enlarge narrow receipts to about 1800px wide.
  const targetWidth = Math.min(2200, Math.max(1400, sourceWidth));
  const scale = Math.min(3.5, Math.max(1, targetWidth / sourceWidth));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.min(9000, Math.round(sourceHeight * scale)));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not prepare the receipt image.");

  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  if ("close" in image && typeof image.close === "function") image.close();

  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    const grey = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    const contrasted = grey < 205
      ? Math.max(0, Math.min(255, Math.round((grey - 128) * 1.8 + 118)))
      : 255;
    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }
  context.putImageData(pixels, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The prepared receipt image could not be created."));
    }, "image/jpeg", 0.94);
  });
}

export function ReceiptWorkspace({ receipts, loadError }: { receipts: ReceiptSummary[]; loadError: boolean }) {
  const [state, action] = useActionState(createReceiptImport, initialReceiptActionState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState("Take a clear vertical photo or choose an existing receipt image.");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [retailer, setRetailer] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [total, setTotal] = useState("");
  const [items, setItems] = useState<ExtractedReceiptLine[]>([]);
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const lines = useMemo(() => serialiseReceiptLines(items), [items]);
  const extractedCount = items.length;

  function updateItem(index: number, patch: Partial<ExtractedReceiptLine>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function processReceipt(file: File) {
    lastFileRef.current = file;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setOcrBusy(true);
    setOcrError(null);
    setRawText("");
    setItems([]);
    setManualMode(false);
    setOcrProgress(1);
    setOcrStatus("Preparing the vertical receipt image…");

    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
    try {
      const prepared = await prepareReceiptImage(file);
      setOcrProgress(8);
      setOcrStatus("Loading the receipt reader… The first use can take a little longer.");

      const { createWorker, PSM } = await import("tesseract.js");
      worker = await createWorker("eng", undefined, {
        logger(message) {
          if (typeof message.progress === "number") {
            const base = message.status === "recognizing text" ? 15 : 8;
            const range = message.status === "recognizing text" ? 84 : 7;
            setOcrProgress(Math.min(99, Math.round(base + message.progress * range)));
          }
          if (message.status) {
            const readable = message.status.replace(/_/g, " ");
            setOcrStatus(`${readable.charAt(0).toUpperCase()}${readable.slice(1)}…`);
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });

      setOcrStatus("Reading retailer, date, total and purchase lines…");
      const result = await worker.recognize(prepared);
      const text = (result.data.text ?? "").trim();
      setRawText(text);
      if (!text) throw new Error("No readable text was detected. Retake the photo closer, keep it flat and avoid glare.");

      const extractedItems = extractReceiptLines(text);
      setRetailer((current) => current || inferRetailer(text));
      setPurchasedAt(inferDate(text));
      setTotal((current) => current || inferTotal(text));
      setItems(extractedItems);
      setOcrProgress(100);

      if (extractedItems.length > 0) {
        setOcrStatus(`Found ${extractedItems.length} likely purchase lines. Review the products and prices below.`);
      } else {
        setOcrError("The receipt text was detected, but individual purchase lines could not be identified reliably.");
        setOcrStatus("Retake the receipt closer and flatter, or enter the purchase lines manually.");
      }
    } catch (error) {
      console.error("Unable to OCR receipt", error);
      const message = error instanceof Error ? error.message : "The receipt could not be read.";
      setOcrError(message);
      setOcrStatus("Receipt reading failed. Retake the photo or retry this image.");
      setOcrProgress(0);
    } finally {
      await worker?.terminate().catch(() => undefined);
      setOcrBusy(false);
    }
  }

  async function handleReceiptImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setOcrError("Choose a JPG, PNG, HEIC or other receipt image.");
      return;
    }
    await processReceipt(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="receipt-layout">
      <section className="card receipt-create-card">
        <div>
          <p className="eyebrow">CAPTURE RECEIPT</p>
          <h2 className="section-title">Photograph, check, import</h2>
          <p className="subtle receipt-copy">Take one clear vertical photo. Food identifies the receipt details and presents only likely purchase lines for review—raw OCR text is never treated as pantry stock.</p>
        </div>

        <label className="receipt-capture" style={{ display: "grid", gap: "0.75rem" }}>
          <span className="button" style={{ justifyContent: "center" }}>{ocrBusy ? `Reading receipt ${ocrProgress}%` : "Take or choose receipt photo"}</span>
          <input
            accept="image/*"
            capture="environment"
            disabled={ocrBusy}
            onChange={(event) => void handleReceiptImage(event.currentTarget.files?.[0] ?? null)}
            ref={fileInputRef}
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
            type="file"
          />
          {imageUrl ? <img alt="Receipt awaiting review" src={imageUrl} style={{ width: "100%", maxHeight: "68dvh", objectFit: "contain", borderRadius: 18, background: "var(--surface-muted, #f3f3f3)" }} /> : null}
          <small className="subtle" role="status">{ocrStatus}</small>
          {ocrBusy ? <progress max="100" value={ocrProgress} style={{ width: "100%" }}>{ocrProgress}%</progress> : null}
        </label>

        {ocrError ? (
          <div className="pantry-error" role="alert">
            <strong>Receipt needs another look.</strong>
            <p>{ocrError}</p>
            <div className="form-actions">
              {lastFileRef.current ? <button className="button" onClick={() => void processReceipt(lastFileRef.current!)} type="button">Retry this photo</button> : null}
              <button className="secondary-button" onClick={() => fileInputRef.current?.click()} type="button">Take another photo</button>
              <button className="secondary-button" onClick={() => setManualMode(true)} type="button">Enter items manually</button>
            </div>
          </div>
        ) : null}

        <form action={action} className="receipt-form">
          <div className="receipt-field-grid">
            <label className="field">
              <span>Retailer</span>
              <input aria-invalid={Boolean(state.fieldErrors?.retailer)} maxLength={100} name="retailer" onChange={(event) => setRetailer(event.target.value)} placeholder="e.g. Coles" required value={retailer} />
              <FieldError state={state} field="retailer" />
            </label>
            <label className="field">
              <span>Purchase date</span>
              <input aria-invalid={Boolean(state.fieldErrors?.purchasedAt)} name="purchasedAt" onChange={(event) => setPurchasedAt(event.target.value)} required type="date" value={purchasedAt} />
              <FieldError state={state} field="purchasedAt" />
            </label>
            <label className="field field-full">
              <span>Receipt total</span>
              <input aria-invalid={Boolean(state.fieldErrors?.total)} min="0" name="total" onChange={(event) => setTotal(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={total} />
              <FieldError state={state} field="total" />
            </label>
          </div>

          {items.length > 0 ? (
            <section style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div><p className="eyebrow">PURCHASE LINES</p><h3 className="section-title">Review {extractedCount} items</h3></div>
                <button className="secondary-button" onClick={() => setItems((current) => [...current, { name: "", quantity: 1, price: "" }])} type="button">Add item</button>
              </div>
              {items.map((item, index) => (
                <div className="card" key={`${index}-${item.name}`} style={{ display: "grid", gap: 10, padding: 14 }}>
                  <label className="field"><span>Product</span><input value={item.name} onChange={(event) => updateItem(index, { name: event.target.value })} /></label>
                  <div className="receipt-field-grid">
                    <label className="field"><span>Quantity</span><input min="0.01" step="0.01" type="number" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Math.max(0.01, Number(event.target.value) || 1) })} /></label>
                    <label className="field"><span>Line price</span><input min="0" step="0.01" type="number" value={item.price} onChange={(event) => updateItem(index, { price: event.target.value })} /></label>
                  </div>
                  <button className="secondary-button" onClick={() => removeItem(index)} type="button">Remove item</button>
                </div>
              ))}
            </section>
          ) : null}

          {manualMode && items.length === 0 ? (
            <label className="field field-full">
              <span>Purchase lines</span>
              <textarea
                onChange={(event) => {
                  const parsed = event.target.value.split(/\r?\n/).flatMap((line) => {
                    const [name, quantity, price] = line.split("|").map((part) => part.trim());
                    return name && price ? [{ name, quantity: Number(quantity) || 1, price }] : [];
                  });
                  setItems(parsed);
                }}
                placeholder={"Greek yoghurt | 1 | 6.50\nBroccoli | 2 | 5.00"}
                rows={8}
              />
              <small className="subtle">Format: Product | quantity | line price.</small>
            </label>
          ) : null}

          <input name="lines" type="hidden" value={lines} />
          <FieldError state={state} field="lines" />
          {state.status !== "idle" ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
          <div className="form-actions"><CreateButton /></div>
        </form>

        {rawText ? (
          <details>
            <summary>Technical: recognised text</summary>
            <p className="subtle">This text is for troubleshooting only and is never imported into Pantry.</p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 240, overflow: "auto", fontSize: 11 }}>{rawText}</pre>
          </details>
        ) : null}
      </section>

      <section className="card receipt-history-card">
        <div className="receipt-history-heading">
          <div><p className="eyebrow">RECEIPT HISTORY</p><h2 className="section-title">{receipts.length} {receipts.length === 1 ? "receipt" : "receipts"}</h2></div>
          <span className="badge neutral">Review before import</span>
        </div>
        {loadError ? (
          <div className="pantry-error" role="alert"><strong>Receipt history is unavailable.</strong><p>Check PostgreSQL and refresh the page.</p></div>
        ) : receipts.length === 0 ? (
          <div className="pantry-empty"><strong>No receipts yet.</strong><p>Photograph your first receipt to begin building purchase and price history.</p></div>
        ) : (
          <div className="receipt-list">{receipts.map((receipt) => <ReceiptCard receipt={receipt} key={receipt.id} />)}</div>
        )}
      </section>
    </div>
  );
}
