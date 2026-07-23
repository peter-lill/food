"use client";

import Link from "next/link";
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
          <div><span>Review progress</span><strong>{receipt.reviewedCount}/{receipt.itemCount}</strong></div>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
      ) : null}
    </Link>
  );
}

export function ReceiptWorkspace({ receipts, loadError }: { receipts: ReceiptSummary[]; loadError: boolean }) {
  const [state, action] = useActionState(createReceiptImport, initialReceiptActionState);

  return (
    <div className="receipt-layout">
      <section className="card receipt-create-card">
        <div>
          <p className="eyebrow">NEW RECEIPT</p>
          <h2 className="section-title">Start a receipt review</h2>
          <p className="subtle receipt-copy">Paste one item per line. You can optionally use <strong>Product | quantity | price</strong>.</p>
        </div>

        <form action={action} className="receipt-form">
          <div className="receipt-field-grid">
            <label className="field">
              <span>Retailer</span>
              <input aria-invalid={Boolean(state.fieldErrors?.retailer)} maxLength={100} name="retailer" placeholder="e.g. Woolworths" required />
              <FieldError state={state} field="retailer" />
            </label>

            <label className="field">
              <span>Purchase date</span>
              <input aria-invalid={Boolean(state.fieldErrors?.purchasedAt)} name="purchasedAt" type="date" required />
              <FieldError state={state} field="purchasedAt" />
            </label>

            <label className="field field-full">
              <span>Receipt total</span>
              <input aria-invalid={Boolean(state.fieldErrors?.total)} min="0" name="total" placeholder="0.00" step="0.01" type="number" required />
              <FieldError state={state} field="total" />
            </label>

            <label className="field field-full">
              <span>Receipt lines</span>
              <textarea
                aria-invalid={Boolean(state.fieldErrors?.lines)}
                name="lines"
                placeholder={"Greek yoghurt | 1 | 6.50\nBroccoli | 2 | 5.00\nDishwashing tablets | 1 | 12.00"}
                required
                rows={10}
              />
              <FieldError state={state} field="lines" />
            </label>
          </div>

          {state.status !== "idle" ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
          <div className="form-actions"><CreateButton /></div>
        </form>
      </section>

      <section className="card receipt-history-card">
        <div className="receipt-history-heading">
          <div>
            <p className="eyebrow">RECEIPT HISTORY</p>
            <h2 className="section-title">{receipts.length} {receipts.length === 1 ? "receipt" : "receipts"}</h2>
          </div>
          <span className="badge neutral">Manual review</span>
        </div>

        {loadError ? (
          <div className="pantry-error" role="alert"><strong>Receipt history is unavailable.</strong><p>Check PostgreSQL and refresh the page.</p></div>
        ) : receipts.length === 0 ? (
          <div className="pantry-empty"><strong>No receipts yet.</strong><p>Create your first receipt review using the form.</p></div>
        ) : (
          <div className="receipt-list">{receipts.map((receipt) => <ReceiptCard receipt={receipt} key={receipt.id} />)}</div>
        )}
      </section>
    </div>
  );
}
