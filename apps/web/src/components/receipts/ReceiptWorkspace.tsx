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

function receiptLines(text: string) {
  const ignored = /^(subtotal|total|amount due|gst|tax|change|cash|eftpos|visa|mastercard|saving|you saved|receipt|abn|thank|www\.|tel|date|time|store)/i;
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3 && !ignored.test(line))
    .flatMap((line) => {
      const match = line.match(/^(.*?)(?:\s+|\s*\$)(\d+[.,]\d{2})\s*$/);
      if (!match) return [];
      const name = match[1].replace(/^\d+\s*[xX]\s*/, "").replace(/\s{2,}/g, " ").trim();
      if (!/[a-z]/i.test(name)) return [];
      return [`${name} | 1 | ${match[2].replace(",", ".")}`];
    })
    .slice(0, 100)
    .join("\n");
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
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(2.25, Math.max(1, 2200 / longestSide));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not prepare the receipt image.");

  context.drawImage(image, 0, 0, width, height);
  if ("close" in image && typeof image.close === "function") image.close();

  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    const grey = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    const contrasted = grey < 185 ? Math.max(0, Math.round((grey - 128) * 1.55 + 128)) : 255;
    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }
  context.putImageData(pixels, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The prepared receipt image could not be created."));
    }, "image/jpeg", 0.92);
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
  const [lines, setLines] = useState("");

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const extractedCount = useMemo(() => lines.split(/\r?\n/).filter((line) => line.trim()).length, [lines]);

  async function processReceipt(file: File) {
    lastFileRef.current = file;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setOcrBusy(true);
    setOcrError(null);
    setRawText("");
    setOcrProgress(1);
    setOcrStatus("Preparing the receipt image…");

    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
    try {
      const prepared = await prepareReceiptImage(file);
      setOcrProgress(8);
      setOcrStatus("Loading the text reader… The first use can take a little longer.");

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
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
      });

      setOcrStatus("Recognising receipt text…");
      const result = await worker.recognize(prepared);
      const text = (result.data.text ?? "").trim();
      setRawText(text);
      if (!text) throw new Error("No readable text was detected. Retake the photo closer, keep it flat and avoid glare.");

      const extractedLines = receiptLines(text);
      setRetailer((current) => current || inferRetailer(text));
      setPurchasedAt(inferDate(text));
      setTotal((current) => current || inferTotal(text));
      setLines(extractedLines || text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n"));
      setOcrProgress(100);
      setOcrStatus(extractedLines
        ? `Found ${extractedLines.split(/\r?\n/).length} likely purchase lines. Check them before creating the review.`
        : "Text was recognised, but the line prices were unclear. The raw text is below for correction.");
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
          <p className="subtle receipt-copy">Food prepares and reads the receipt on this device, then gives you an editable review before anything reaches Pantry or price history.</p>
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
          {imageUrl ? <img alt="Receipt awaiting review" src={imageUrl} style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 18, background: "var(--surface-muted, #f3f3f3)" }} /> : null}
          <small className="subtle" role="status">{ocrStatus}</small>
          {ocrBusy ? <progress max="100" value={ocrProgress} style={{ width: "100%" }}>{ocrProgress}%</progress> : null}
        </label>

        {ocrError ? (
          <div className="pantry-error" role="alert">
            <strong>Receipt text was not extracted.</strong>
            <p>{ocrError}</p>
            <div className="form-actions">
              {lastFileRef.current ? <button className="button" onClick={() => void processReceipt(lastFileRef.current!)} type="button">Retry this photo</button> : null}
              <button className="secondary-button" onClick={() => fileInputRef.current?.click()} type="button">Take another photo</button>
            </div>
          </div>
        ) : null}

        {rawText ? (
          <details>
            <summary>View all recognised text</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{rawText}</pre>
          </details>
        ) : null}

        <form action={action} className="receipt-form">
          <div className="receipt-field-grid">
            <label className="field">
              <span>Retailer</span>
              <input aria-invalid={Boolean(state.fieldErrors?.retailer)} maxLength={100} name="retailer" onChange={(event) => setRetailer(event.target.value)} placeholder="e.g. Woolworths" required value={retailer} />
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
            <label className="field field-full">
              <span>Extracted purchase lines {extractedCount ? `(${extractedCount})` : ""}</span>
              <textarea aria-invalid={Boolean(state.fieldErrors?.lines)} name="lines" onChange={(event) => setLines(event.target.value)} placeholder={"Greek yoghurt | 1 | 6.50\nBroccoli | 2 | 5.00"} required rows={12} value={lines} />
              <small className="subtle">Format: Product | quantity | line price. Correct any OCR mistakes before continuing.</small>
              <FieldError state={state} field="lines" />
            </label>
          </div>
          {state.status !== "idle" ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
          <div className="form-actions"><CreateButton /></div>
        </form>
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
