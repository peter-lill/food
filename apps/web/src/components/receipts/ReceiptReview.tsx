"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addReceiptItem,
  cancelReceiptImport,
  finaliseReceiptImport,
  removeReceiptItem,
  updateReceiptItem,
} from "@/lib/receipts/receipt.actions";
import { pantryLocations, type PantryLocation } from "@/lib/pantry/pantry.types";
import {
  initialReceiptActionState,
  type ReceiptActionState,
  type ReceiptDetail,
  type ReceiptReviewItem,
} from "@/lib/receipts/receipt.types";

const locationLabels: Record<PantryLocation, string> = {
  PANTRY: "Pantry",
  FRIDGE: "Fridge",
  FREEZER: "Freezer",
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
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function FieldError({ state, field }: { state: ReceiptActionState; field: string }) {
  const message = state.fieldErrors?.[field];
  return message ? <small className="field-error">{message}</small> : null;
}

function ActionMessage({ state }: { state: ReceiptActionState }) {
  return state.status === "idle"
    ? null
    : <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function SaveLineButton() {
  const { pending } = useFormStatus();
  return <button className="secondary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save line"}</button>;
}

function AddLineButton() {
  const { pending } = useFormStatus();
  return <button className="secondary-button" type="submit" disabled={pending}>{pending ? "Adding…" : "Add line"}</button>;
}

function ImportButton() {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending}>{pending ? "Importing…" : "Import food to Pantry"}</button>;
}

function ReceiptLine({ receiptId, item, editable }: { receiptId: string; item: ReceiptReviewItem; editable: boolean }) {
  const initialClassification = item.isFood === true ? "food" : item.isFood === false ? "non-food" : "";
  const [classification, setClassification] = useState<"" | "food" | "non-food">(initialClassification);
  const updateAction = updateReceiptItem.bind(null, receiptId, item.id);
  const [state, action] = useActionState(updateAction, initialReceiptActionState);
  const foodFieldsEnabled = editable && classification === "food";

  return (
    <article className={`receipt-line ${item.isFood === null ? "unreviewed" : "reviewed"}`}>
      <div className="receipt-line-heading">
        <div>
          <p className="eyebrow">ORIGINAL RECEIPT LINE</p>
          <strong>{item.rawDescription}</strong>
        </div>
        <span className={`badge ${item.isFood === null ? "warning" : item.isFood ? "" : "neutral"}`}>
          {item.isFood === null ? "Unreviewed" : item.isFood ? "Food" : "Non-food"}
        </span>
      </div>

      <form action={action} className="receipt-line-form">
        <div className="receipt-field-grid review-grid">
          <label className="field">
            <span>Classification</span>
            <select
              aria-invalid={Boolean(state.fieldErrors?.classification)}
              disabled={!editable}
              name="classification"
              onChange={(event) => setClassification(event.target.value as "" | "food" | "non-food")}
              required
              value={classification}
            >
              <option value="">Choose…</option>
              <option value="food">Food</option>
              <option value="non-food">Non-food</option>
            </select>
            <FieldError state={state} field="classification" />
          </label>

          <label className="field">
            <span>Line price</span>
            <input aria-invalid={Boolean(state.fieldErrors?.price)} defaultValue={item.price ?? ""} disabled={!editable} min="0" name="price" step="0.01" type="number" />
            <FieldError state={state} field="price" />
          </label>

          <label className="field field-wide">
            <span>Pantry product name</span>
            <input
              aria-invalid={Boolean(state.fieldErrors?.normalisedName)}
              defaultValue={item.normalisedName ?? item.rawDescription}
              disabled={!foodFieldsEnabled}
              maxLength={100}
              name="normalisedName"
              required={foodFieldsEnabled}
            />
            <FieldError state={state} field="normalisedName" />
          </label>

          <label className="field">
            <span>Quantity</span>
            <input aria-invalid={Boolean(state.fieldErrors?.quantity)} defaultValue={item.quantity ?? 1} disabled={!foodFieldsEnabled} min="0.01" name="quantity" required={foodFieldsEnabled} step="0.01" type="number" />
            <FieldError state={state} field="quantity" />
          </label>

          <label className="field">
            <span>Unit</span>
            <input aria-invalid={Boolean(state.fieldErrors?.unit)} defaultValue={item.unit ?? "item"} disabled={!foodFieldsEnabled} list="receipt-units" maxLength={30} name="unit" required={foodFieldsEnabled} />
            <FieldError state={state} field="unit" />
          </label>

          <label className="field">
            <span>Store in</span>
            <select aria-invalid={Boolean(state.fieldErrors?.location)} defaultValue={item.location ?? "PANTRY"} disabled={!foodFieldsEnabled} name="location" required={foodFieldsEnabled}>
              {pantryLocations.map((location) => <option key={location} value={location}>{locationLabels[location]}</option>)}
            </select>
            <FieldError state={state} field="location" />
          </label>

          <label className="field">
            <span>Expiry date</span>
            <input aria-invalid={Boolean(state.fieldErrors?.expiresAt)} defaultValue={item.expiresAt ?? ""} disabled={!foodFieldsEnabled} name="expiresAt" type="date" />
            <FieldError state={state} field="expiresAt" />
          </label>
        </div>

        {editable ? (
          <div className="receipt-line-actions">
            <ActionMessage state={state} />
            <div>
              <SaveLineButton />
              <button className="danger-button" formAction={removeReceiptItem.bind(null, receiptId, item.id)} formNoValidate type="submit">Remove line</button>
            </div>
          </div>
        ) : null}
      </form>
    </article>
  );
}

function AddReceiptLine({ receiptId }: { receiptId: string }) {
  const addAction = addReceiptItem.bind(null, receiptId);
  const [state, action] = useActionState(addAction, initialReceiptActionState);

  return (
    <details className="card receipt-add-line">
      <summary>Add a missing receipt line</summary>
      <form action={action} className="receipt-inline-form">
        <label className="field">
          <span>Description</span>
          <input aria-invalid={Boolean(state.fieldErrors?.rawDescription)} maxLength={300} name="rawDescription" placeholder="e.g. Frozen peas | 1 | 3.50" required />
          <FieldError state={state} field="rawDescription" />
        </label>
        <ActionMessage state={state} />
        <AddLineButton />
      </form>
    </details>
  );
}

function FinaliseReceipt({ receipt }: { receipt: ReceiptDetail }) {
  const actionWithId = finaliseReceiptImport.bind(null, receipt.id);
  const [state, action] = useActionState(actionWithId, initialReceiptActionState);
  const reviewedCount = receipt.items.filter((item) => item.isFood !== null).length;
  const foodCount = receipt.items.filter((item) => item.isFood === true).length;
  const ready = receipt.items.length > 0 && reviewedCount === receipt.items.length && foodCount > 0;

  return (
    <section className="card receipt-finalise-card">
      <div>
        <p className="eyebrow">FINAL CHECK</p>
        <h2 className="section-title">Import reviewed food</h2>
        <p className="subtle receipt-copy">{reviewedCount}/{receipt.items.length} lines reviewed · {foodCount} food {foodCount === 1 ? "item" : "items"}</p>
      </div>
      <ActionMessage state={state} />
      <div className="receipt-finalise-actions">
        <form action={cancelReceiptImport.bind(null, receipt.id)}><button className="danger-button" type="submit">Cancel receipt</button></form>
        <form action={action}><ImportButton /></form>
      </div>
      {!ready ? <small className="subtle">Classify every line and include at least one food item before importing.</small> : null}
    </section>
  );
}

export function ReceiptReview({ receipt }: { receipt: ReceiptDetail }) {
  const editable = receipt.status === "DRAFT";
  const reviewedCount = receipt.items.filter((item) => item.isFood !== null).length;
  const foodCount = receipt.items.filter((item) => item.isFood === true).length;
  const lineTotal = receipt.items.reduce((total, item) => total + (item.price ?? 0), 0);
  const variance = receipt.total === null ? null : receipt.total - lineTotal;

  return (
    <div className="receipt-review-layout">
      <datalist id="receipt-units">
        <option value="item" /><option value="pack" /><option value="g" /><option value="kg" />
        <option value="mL" /><option value="L" /><option value="tub" /><option value="fillet" />
      </datalist>

      <section className="card receipt-summary-card">
        <div className="receipt-summary-heading">
          <div>
            <p className="eyebrow">{receipt.status === "DRAFT" ? "RECEIPT REVIEW" : "RECEIPT RECORD"}</p>
            <h1>{receipt.retailer ?? "Unknown retailer"}</h1>
            <p>{receipt.purchasedAt ? formatDate(receipt.purchasedAt) : "Purchase date not recorded"}</p>
          </div>
          <span className={`badge receipt-status ${receipt.status.toLowerCase()}`}>{receipt.status === "DRAFT" ? "Needs review" : receipt.status === "IMPORTED" ? "Imported" : "Cancelled"}</span>
        </div>

        <div className="receipt-summary-metrics">
          <span><strong>{formatMoney(receipt.total)}</strong><small>Receipt total</small></span>
          <span><strong>{formatMoney(lineTotal)}</strong><small>Reviewed line total</small></span>
          <span><strong>{variance === null ? "—" : formatMoney(variance)}</strong><small>Difference</small></span>
          <span><strong>{reviewedCount}/{receipt.items.length}</strong><small>Reviewed</small></span>
          <span><strong>{foodCount}</strong><small>Food items</small></span>
        </div>

        <div className="receipt-summary-links">
          <Link className="secondary-button" href="/receipts">Back to receipts</Link>
          {receipt.status === "IMPORTED" ? <Link className="button" href="/pantry">View Pantry</Link> : null}
        </div>
      </section>

      {editable ? <AddReceiptLine receiptId={receipt.id} /> : null}

      <section className="receipt-review-list">
        {receipt.items.length === 0
          ? <div className="card pantry-empty"><strong>No receipt lines.</strong><p>Add a line before continuing.</p></div>
          : receipt.items.map((item) => <ReceiptLine editable={editable} item={item} key={item.id} receiptId={receipt.id} />)}
      </section>

      {editable ? <FinaliseReceipt receipt={receipt} /> : null}
    </div>
  );
}
