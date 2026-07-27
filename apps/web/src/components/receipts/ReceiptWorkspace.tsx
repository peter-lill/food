"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
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
  const totalLine = [...lines].reverse().find((line) => /\b(?:grand\s+total|total)\b/i.test(line));
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
  const ignored = /^(subtotal|total|gst|tax|change|cash|eftpos|visa|mastercard|saving|you saved|receipt|abn|thank|www\.|tel|date|time|store)/i;
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

export function ReceiptWorkspace({ receipts, loadError }: { receipts: ReceiptSummary[]; loadError: boolean }) {
  const [state, action] = useActionState(createReceiptImport, initialReceiptActionState);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState("Take a clear vertical photo or choose an existing receipt image.");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [retailer, setRetailer] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [total, setTotal] = useState("");
  const [lines, setLines] = useState("");

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const extractedCount = useMemo(() => lines.split(/\r?\n/).filter((line) => line.trim()).length, [lines]);

  async function handleReceiptImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setOcrStatus("Choose a JPG, PNG, HEIC or other receipt image.");
      return;
    }

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setOcrBusy(true);
    setOcrProgress(0);
    setOcrStatus("Reading receipt… Keep this page open while the image is processed on your device.");

    try {
      const { recognize } = await import("tesseract.js");
      const result = await recognize(file, "eng", {
        logger(message) {
          if (message.status === "recognizing text" && typeof message.progress === "number") {
            setOcrProgress(Math.round(message.progress * 100));
          }
        },
      });
      const text = result.data.text ?? "";
      const extractedLines = receiptLines(text);
      setRetailer((current) => current || inferRetailer(text));
      setPurchasedAt(inferDate(text));
      setTotal((current) => current || inferTotal(text));
      setLines(extractedLines || text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n"));
      setOcrStatus(extractedLines
        ? `Found ${extractedLines.split(/\r?\n/).length} likely purchase lines. Check them before creating the review.`
        : "Text was found, but the prices were unclear. Edit the extracted text before continuing.");
    } catch (error) {
      console.error("Unable to OCR receipt", error);
      setOcrStatus("The image could not be read automatically. You can still enter or paste the receipt lines below.");
    } finally {
      setOcrBusy(false);
    }
  }

  return (
    <div className="receipt-layout">
      <section className="card receipt-create-card">
        <div>
          <p className="eyebrow">CAPTURE RECEIPT</p>
          <h2 className="section-title">Photograph, check, import</h2>
          <p className="subtle receipt-copy">Food reads the receipt in your browser, then gives you an editable review before anything reaches Pantry or price history.</p>
        </div>

        <label className="receipt-capture" style={{ display: "grid", gap: "0.75rem" }}>
          <span className="button" style={{ justifyContent: "center" }}>{ocrBusy ? `Reading receipt ${ocrProgress}%` : "Take or choose receipt photo"}</span>
          <input
            accept="image/*"
            capture="environment"
            disabled={ocrBusy}
            onChange={(event) => void handleReceiptImage(event.currentTarget.files?.[0] ?? null)}
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
            type="file"
          />
          {imageUrl ? <img alt="Receipt awaiting review" src={imageUrl} style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 18, background: "var(--surface-muted, #f3f3f3)" }} /> : null}
          <small className="subtle" role="status">{ocrStatus}</small>
          {ocrBusy ? <progress max="100" value={ocrProgress} style={{ width: "100%" }}>{ocrProgress}%</progress> : null}
        </label>

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
