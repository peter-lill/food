"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { useActionState } from "react";
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

type ExtractedReceipt = {
  retailer: string | null;
  purchasedAt: string | null;
  total: number | null;
  lines: Array<{
    description: string;
    quantity: number | null;
    price: number | null;
  }>;
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

function receiptLinesText(receipt: ExtractedReceipt) {
  return receipt.lines
    .filter((line) => line.description.trim())
    .map((line) => {
      const quantity = line.quantity && line.quantity > 0 ? line.quantity : 1;
      return line.price === null
        ? line.description.trim()
        : `${line.description.trim()} | ${quantity} | ${line.price.toFixed(2)}`;
    })
    .join("\n");
}

function FieldError({ state, field }: { state: ReceiptActionState; field: string }) {
  const message = state.fieldErrors?.[field];
  return message ? <small className="field-error" id={`${field}-error`}>{message}</small> : null;
}

function CreateButton() {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending}>{pending ? "Creating…" : "Create review"}</button>;
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
          <div><span>Review progress</span><strong>{receipt.itemCount === 0 ? "No lines" : `${receipt.reviewedCount}/${receipt.itemCount}`}</strong></div>
          <div className="progress" role="progressbar" aria-label="Receipt review progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
        </div>
      ) : null}
    </Link>
  );
}

export function ReceiptWorkspace({ receipts, loadError }: { receipts: ReceiptSummary[]; loadError: boolean }) {
  const [state, action] = useActionState(createReceiptImport, initialReceiptActionState);
  const [retailer, setRetailer] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [total, setTotal] = useState("");
  const [lines, setLines] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }

    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setExtractMessage(null);

    if (!file) {
      setImageFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setImageFile(null);
      setExtractMessage("Choose a photo or image of a receipt.");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setImageFile(null);
      setExtractMessage("Receipt images must be smaller than 10 MB.");
      event.target.value = "";
      return;
    }

    setImageFile(file);
  }

  async function extractReceipt() {
    if (!imageFile || extracting) return;

    setExtracting(true);
    setExtractMessage("Reading the receipt…");

    try {
      const body = new FormData();
      body.set("receipt", imageFile);
      const response = await fetch("/api/receipts/extract", { method: "POST", body });
      const payload = await response.json() as { receipt?: ExtractedReceipt; error?: string };

      if (!response.ok || !payload.receipt) {
        throw new Error(payload.error || "The receipt could not be read.");
      }

      const extracted = payload.receipt;
      setRetailer(extracted.retailer ?? "");
      setPurchasedAt(extracted.purchasedAt ?? "");
      setTotal(extracted.total === null ? "" : extracted.total.toFixed(2));
      setLines(receiptLinesText(extracted));
      setManualOpen(true);
      setExtractMessage(`Found ${extracted.lines.length} receipt line${extracted.lines.length === 1 ? "" : "s"}. Check the details before creating the review.`);
    } catch (error) {
      setExtractMessage(error instanceof Error ? error.message : "The receipt could not be read.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="receipt-layout">
      <section className="card receipt-create-card">
        <div>
          <p className="eyebrow">NEW RECEIPT</p>
          <h2 className="section-title">Scan a receipt</h2>
          <p className="subtle receipt-copy">Take a clear photo or choose an existing image. The detected retailer, date, total and products will be placed into the review form.</p>
        </div>

        <div className="receipt-upload-panel">
          <label className="receipt-upload-dropzone">
            <input accept="image/*" capture="environment" onChange={handleImageChange} type="file" />
            {imagePreview ? <img alt="Selected receipt" src={imagePreview} /> : <span aria-hidden="true" className="receipt-upload-icon">▧</span>}
            <strong>{imageFile ? "Change receipt photo" : "Take or choose a receipt photo"}</strong>
            <small>JPG, PNG, HEIC or WebP · maximum 10 MB</small>
          </label>

          <button className="button receipt-extract-button" disabled={!imageFile || extracting} onClick={extractReceipt} type="button">
            {extracting ? "Reading receipt…" : "Extract receipt text"}
          </button>

          {extractMessage ? <p className={`form-message ${extractMessage.startsWith("Found") ? "success" : extracting ? "success" : "error"}`} role={extracting ? "status" : "alert"}>{extractMessage}</p> : null}
        </div>

        <details className="receipt-manual-entry" open={manualOpen} onToggle={(event) => setManualOpen(event.currentTarget.open)}>
          <summary>{lines ? "Review extracted details" : "Enter receipt manually"}</summary>
          <form action={action} className="receipt-form">
            <div className="receipt-field-grid">
              <label className="field">
                <span>Retailer</span>
                <input aria-describedby={state.fieldErrors?.retailer ? "retailer-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.retailer)} maxLength={100} name="retailer" onChange={(event) => setRetailer(event.target.value)} placeholder="e.g. Woolworths" required value={retailer} />
                <FieldError state={state} field="retailer" />
              </label>

              <label className="field">
                <span>Purchase date</span>
                <input aria-describedby={state.fieldErrors?.purchasedAt ? "purchasedAt-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.purchasedAt)} name="purchasedAt" onChange={(event) => setPurchasedAt(event.target.value)} required type="date" value={purchasedAt} />
                <FieldError state={state} field="purchasedAt" />
              </label>

              <label className="field field-full">
                <span>Receipt total</span>
                <input aria-describedby={state.fieldErrors?.total ? "total-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.total)} min="0" name="total" onChange={(event) => setTotal(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={total} />
                <FieldError state={state} field="total" />
              </label>

              <label className="field field-full">
                <span>Receipt lines</span>
                <textarea
                  aria-describedby={state.fieldErrors?.lines ? "lines-error" : undefined}
                  aria-invalid={Boolean(state.fieldErrors?.lines)}
                  name="lines"
                  onChange={(event) => setLines(event.target.value)}
                  placeholder={"Greek yoghurt | 1 | 6.50\nBroccoli | 2 | 5.00\nDishwashing tablets | 1 | 12.00"}
                  required
                  rows={10}
                  value={lines}
                />
                <FieldError state={state} field="lines" />
              </label>
            </div>

            {state.status !== "idle" ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
            <div className="form-actions"><CreateButton /></div>
          </form>
        </details>
      </section>

      <section className="card receipt-history-card">
        <div className="receipt-history-heading">
          <div>
            <p className="eyebrow">RECEIPT HISTORY</p>
            <h2 className="section-title">{receipts.length} {receipts.length === 1 ? "receipt" : "receipts"}</h2>
          </div>
          <span className="badge neutral">Review before import</span>
        </div>

        {loadError ? (
          <div className="pantry-error" role="alert"><strong>Receipt history is unavailable.</strong><p>Refresh the page and try again.</p></div>
        ) : receipts.length === 0 ? (
          <div className="pantry-empty"><strong>No receipts yet.</strong><p>Scan your first receipt or enter one manually.</p></div>
        ) : (
          <div className="receipt-list">{receipts.map((receipt) => <ReceiptCard receipt={receipt} key={receipt.id} />)}</div>
        )}
      </section>
    </div>
  );
}
