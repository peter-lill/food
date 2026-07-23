"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ProductBarcodePicker } from "@/components/products/ProductBarcodePicker";
import {
  consumePantryItem,
  consumePantryItemAndAddToShoppingList,
  createPantryItem,
  removePantryItem,
  updatePantryItem,
} from "@/lib/pantry/pantry.actions";
import {
  initialPantryActionState,
  pantryLocations,
  type PantryActionState,
  type PantryItem,
  type PantryLocation,
} from "@/lib/pantry/pantry.types";
import type { ProductCatalogueItem } from "@/lib/products/product-catalogue.types";

const locationLabels: Record<PantryLocation, string> = {
  PANTRY: "Pantry",
  FRIDGE: "Fridge",
  FREEZER: "Freezer",
};

type ShoppingListOption = {
  id: string;
  name: string;
};

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity)
    ? quantity.toLocaleString("en-AU")
    : quantity.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function FieldError({ state, field }: { state: PantryActionState; field: string }) {
  const message = state.fieldErrors?.[field];
  return message ? <small className="field-error">{message}</small> : null;
}

function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();

  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

function PantryFields({
  state,
  item,
}: {
  state: PantryActionState;
  item?: PantryItem;
}) {
  return (
    <div className="pantry-field-grid">
      <label className="field">
        <span>Quantity</span>
        <input
          aria-invalid={Boolean(state.fieldErrors?.quantity)}
          defaultValue={item?.quantity ?? 1}
          min="0.01"
          name="quantity"
          required
          step="0.01"
          type="number"
        />
        <FieldError state={state} field="quantity" />
      </label>

      <label className="field">
        <span>Unit</span>
        <input
          aria-invalid={Boolean(state.fieldErrors?.unit)}
          defaultValue={item?.unit ?? "item"}
          list="pantry-units"
          maxLength={30}
          name="unit"
          required
        />
        <FieldError state={state} field="unit" />
      </label>

      <label className="field">
        <span>Stored in</span>
        <select
          aria-invalid={Boolean(state.fieldErrors?.location)}
          defaultValue={item?.location ?? "PANTRY"}
          name="location"
          required
        >
          {pantryLocations.map((location) => (
            <option value={location} key={location}>{locationLabels[location]}</option>
          ))}
        </select>
        <FieldError state={state} field="location" />
      </label>

      <label className="field">
        <span>Purchased</span>
        <input
          aria-invalid={Boolean(state.fieldErrors?.purchasedAt)}
          defaultValue={item?.purchasedAt ?? ""}
          name="purchasedAt"
          type="date"
        />
        <FieldError state={state} field="purchasedAt" />
      </label>

      <label className="field">
        <span>Expires</span>
        <input
          aria-invalid={Boolean(state.fieldErrors?.expiresAt)}
          defaultValue={item?.expiresAt ?? ""}
          name="expiresAt"
          type="date"
        />
        <FieldError state={state} field="expiresAt" />
      </label>
    </div>
  );
}

function ActionMessage({ state }: { state: PantryActionState }) {
  if (state.status === "idle") return null;

  return (
    <p
      className={`form-message ${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function AddPantryForm({ products }: { products: ProductCatalogueItem[] }) {
  const [state, action] = useActionState(createPantryItem, initialPantryActionState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <section className="card pantry-add-card">
      <div>
        <p className="eyebrow">ADD STOCK</p>
        <h2 className="section-title">Add a pantry item</h2>
        <p className="subtle pantry-copy">Choose a saved product or keep the camera live and scan each barcode as you put groceries away.</p>
      </div>

      <form action={action} className="pantry-form" ref={formRef}>
        <ProductBarcodePicker
          barcodeError={state.fieldErrors?.barcode}
          nameError={state.fieldErrors?.name}
          products={products}
        />

        <PantryFields state={state} />
        <ActionMessage state={state} />
        <div className="form-actions">
          <SubmitButton pendingText="Adding…">Add to Pantry</SubmitButton>
        </div>
      </form>
    </section>
  );
}

function PantryItemCard({
  item,
  shoppingLists,
}: {
  item: PantryItem;
  shoppingLists: ShoppingListOption[];
}) {
  const updateAction = updatePantryItem.bind(null, item.id);
  const restockAction = consumePantryItemAndAddToShoppingList.bind(null, item.id);
  const [state, action] = useActionState(updateAction, initialPantryActionState);
  const attentionLabel = item.expired ? "Expired" : item.useSoon ? "Use soon" : null;

  return (
    <article className="pantry-item">
      <div className="pantry-item-summary">
        <div>
          <div className="pantry-item-title">
            <strong>{item.name}</strong>
            {attentionLabel ? (
              <span className={`badge ${item.expired ? "danger" : "warning"}`}>{attentionLabel}</span>
            ) : null}
          </div>
          <div className="pantry-item-meta">
            <span>{locationLabels[item.location]}</span>
            {item.barcode ? <span>Barcode {item.barcode}</span> : null}
            {item.purchasedAt ? <span>Purchased {formatDate(item.purchasedAt)}</span> : null}
            {item.expiresAt ? <span>Expires {formatDate(item.expiresAt)}</span> : <span>No expiry set</span>}
          </div>
        </div>
        <div className="pantry-quantity">
          <strong>{formatQuantity(item.quantity)}</strong>
          <span>{item.unit}</span>
        </div>
      </div>

      <div className="pantry-item-controls">
        <details className="pantry-edit">
          <summary>Edit</summary>
          <form action={action} className="pantry-form compact">
            <PantryFields state={state} item={item} />
            <ActionMessage state={state} />
            <div className="form-actions">
              <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
            </div>
          </form>
        </details>

        <div className="pantry-stock-actions">
          {shoppingLists.length > 0 ? (
            <form action={restockAction} className="pantry-restock-form">
              <label className="field pantry-restock-list">
                <span>Replacement list</span>
                <select defaultValue={shoppingLists[0].id} name="shoppingListId" required>
                  {shoppingLists.map((list) => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </label>
              <button className="button" type="submit">Consume + add to list</button>
            </form>
          ) : (
            <p className="pantry-no-list">
              <Link href="/shopping">Create a shopping list</Link> to add replacements when stock is consumed.
            </p>
          )}

          <div className="pantry-destructive-actions">
            <form action={consumePantryItem.bind(null, item.id)}>
              <button className="secondary-button" type="submit">Mark consumed</button>
            </form>
            <form action={removePantryItem.bind(null, item.id)}>
              <button className="danger-button" type="submit">Remove</button>
            </form>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PantryManager({
  items,
  loadError,
  products,
  shoppingLists,
}: {
  items: PantryItem[];
  loadError: boolean;
  products: ProductCatalogueItem[];
  shoppingLists: ShoppingListOption[];
}) {
  return (
    <div className="pantry-layout">
      <datalist id="pantry-units">
        <option value="item" />
        <option value="pack" />
        <option value="g" />
        <option value="kg" />
        <option value="mL" />
        <option value="L" />
        <option value="tub" />
        <option value="fillet" />
      </datalist>

      <AddPantryForm products={products} />

      <section className="card pantry-stock-card">
        <div className="pantry-stock-heading">
          <div>
            <p className="eyebrow">CURRENT STOCK</p>
            <h2 className="section-title">{items.length} {items.length === 1 ? "item" : "items"}</h2>
          </div>
          <span className="badge neutral">Live database</span>
        </div>

        {loadError ? (
          <div className="pantry-error" role="alert">
            <strong>Pantry data is unavailable.</strong>
            <p>Check the PostgreSQL connection and refresh this page.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="pantry-empty">
            <strong>Your pantry is empty.</strong>
            <p>Add your first item using the form.</p>
          </div>
        ) : (
          <div className="pantry-items">
            {items.map((item) => (
              <PantryItemCard item={item} key={item.id} shoppingLists={shoppingLists} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
