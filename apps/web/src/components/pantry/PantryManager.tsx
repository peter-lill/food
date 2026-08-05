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
  type PantryGroup,
  type PantryItem,
  type PantryLocation,
} from "@/lib/pantry/pantry.types";
import type { ProductCatalogueItem } from "@/lib/products/product-catalogue.types";
import styles from "./PantryManager.module.css";

const locationLabels: Record<PantryLocation, string> = {
  PANTRY: "Pantry",
  FRIDGE: "Fridge",
  FREEZER: "Freezer",
};

type ShoppingListOption = { id: string; name: string };

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
  return <button className="button" disabled={pending} type="submit">{pending ? pendingText : children}</button>;
}

function PantryFields({ state, item }: { state: PantryActionState; item?: PantryItem }) {
  return (
    <div className="pantry-field-grid">
      <label className="field"><span>Quantity</span><input aria-invalid={Boolean(state.fieldErrors?.quantity)} defaultValue={item?.quantity ?? 1} min="0.01" name="quantity" required step="0.01" type="number" /><FieldError state={state} field="quantity" /></label>
      <label className="field"><span>Unit</span><input aria-invalid={Boolean(state.fieldErrors?.unit)} defaultValue={item?.unit ?? "item"} list="pantry-units" maxLength={30} name="unit" required /><FieldError state={state} field="unit" /></label>
      <label className="field"><span>Stored in</span><select aria-invalid={Boolean(state.fieldErrors?.location)} defaultValue={item?.location ?? "PANTRY"} name="location" required>{pantryLocations.map((location) => <option key={location} value={location}>{locationLabels[location]}</option>)}</select><FieldError state={state} field="location" /></label>
      <label className="field"><span>Purchased</span><input aria-invalid={Boolean(state.fieldErrors?.purchasedAt)} defaultValue={item?.purchasedAt ?? ""} name="purchasedAt" type="date" /><FieldError state={state} field="purchasedAt" /></label>
      <label className="field"><span>Expires</span><input aria-invalid={Boolean(state.fieldErrors?.expiresAt)} defaultValue={item?.expiresAt ?? ""} name="expiresAt" type="date" /><FieldError state={state} field="expiresAt" /></label>
    </div>
  );
}

function ActionMessage({ state }: { state: PantryActionState }) {
  if (state.status === "idle") return null;
  return <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

export function AddPantryForm({ products, autoOpenScanner = false, fullPageScanner = false }: { products: ProductCatalogueItem[]; autoOpenScanner?: boolean; fullPageScanner?: boolean }) {
  const [state, action] = useActionState(createPantryItem, initialPantryActionState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <section className="card pantry-add-card">
      {!fullPageScanner ? <div><p className="eyebrow">ADD STOCK</p><h2 className="section-title">Add a pantry item</h2><p className="subtle pantry-copy">Scan a product or choose an existing grocery item. Equivalent products will appear together in Pantry.</p></div> : null}
      <form action={action} className="pantry-form" ref={formRef}>
        <ProductBarcodePicker
          autoOpenScanner={autoOpenScanner}
          autoSubmitOnScan={fullPageScanner}
          barcodeError={state.fieldErrors?.barcode}
          fullPageScanner={fullPageScanner}
          nameError={state.fieldErrors?.name}
          products={products}
          submissionStatus={state.status}
        />
        <PantryFields state={state} />
        <ActionMessage state={state} />
        <div className="form-actions"><SubmitButton pendingText="Adding…">Add to Pantry</SubmitButton></div>
      </form>
    </section>
  );
}

function InventoryRecord({ item, shoppingLists }: { item: PantryItem; shoppingLists: ShoppingListOption[] }) {
  const updateAction = updatePantryItem.bind(null, item.id);
  const restockAction = consumePantryItemAndAddToShoppingList.bind(null, item.id);
  const [state, action] = useActionState(updateAction, initialPantryActionState);

  return (
    <article className={styles.record}>
      <div className={styles.recordTop}>
        <div>
          <strong>{formatQuantity(item.quantity)} {item.unit}</strong>
          <div className={styles.recordMeta}>
            <span>{locationLabels[item.location]}</span>
            {item.purchasedAt ? <span>Purchased {formatDate(item.purchasedAt)}</span> : null}
            {item.expiresAt ? <span>Expires {formatDate(item.expiresAt)}</span> : <span>No expiry set</span>}
            {item.barcode ? <span>Barcode {item.barcode}</span> : null}
          </div>
        </div>
        {item.expired ? <span className="badge danger">Expired</span> : item.useSoon ? <span className="badge warning">Use soon</span> : null}
      </div>

      <details className={styles.edit}>
        <summary>Edit inventory record</summary>
        <form action={action} className="pantry-form compact">
          <PantryFields item={item} state={state} />
          <ActionMessage state={state} />
          <div className="form-actions"><SubmitButton pendingText="Saving…">Save changes</SubmitButton></div>
        </form>
      </details>

      <div className={styles.actions}>
        <form action={consumePantryItem.bind(null, item.id)}><button className="secondary-button" type="submit">Mark consumed</button></form>
        <form action={removePantryItem.bind(null, item.id)}><button className="danger-button" type="submit">Remove</button></form>
      </div>

      {shoppingLists.length > 0 ? (
        <form action={restockAction} className="pantry-restock-form">
          <label className="field pantry-restock-list"><span>Consume and replace on</span><select defaultValue={shoppingLists[0].id} name="shoppingListId" required>{shoppingLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
          <button className="button" type="submit">Consume + add to list</button>
        </form>
      ) : <p className="pantry-no-list"><Link href="/shopping">Create a shopping list</Link> to add replacements.</p>}
    </article>
  );
}

function PantryGroupCard({ group, shoppingLists }: { group: PantryGroup; shoppingLists: ShoppingListOption[] }) {
  const attentionLabel = group.expired ? "Expired stock" : group.useSoon ? "Use soon" : null;
  return (
    <details className={styles.group}>
      <summary className={styles.groupSummary}>
        <div className={styles.hero}>
          {group.imageUrl ? <img alt="" className={styles.image} src={group.imageUrl} /> : <div className={styles.placeholder} aria-hidden="true">◉</div>}
          <div className={styles.title}>
            <strong>{group.canonicalName}</strong>
            <span className="subtle">{group.recordCount} inventory {group.recordCount === 1 ? "record" : "records"}</span>
            <div className={styles.meta}>
              {group.locations.map((location) => <span className="badge neutral" key={location}>{locationLabels[location]}</span>)}
              {attentionLabel ? <span className={`badge ${group.expired ? "danger" : "warning"}`}>{attentionLabel}</span> : null}
            </div>
          </div>
        </div>
        <div className={styles.quantityRow}>{group.quantities.map((summary) => <span className={styles.quantity} key={summary.unit}>{formatQuantity(summary.quantity)} {summary.unit}</span>)}</div>
        <span className="subtle">{group.earliestExpiry ? `Earliest expiry ${formatDate(group.earliestExpiry)}` : "No expiry dates recorded"} · Open for individual stock</span>
      </summary>
      <div className={styles.records}>{group.items.map((item) => <InventoryRecord item={item} key={item.id} shoppingLists={shoppingLists} />)}</div>
    </details>
  );
}

export function PantryManager({ items: groups, loadError, products, shoppingLists }: { items: PantryGroup[]; loadError: boolean; products: ProductCatalogueItem[]; shoppingLists: ShoppingListOption[] }) {
  const categories = [...new Set(groups.map((group) => group.category))];
  const inventoryCount = groups.reduce((total, group) => total + group.recordCount, 0);
  const expiringCount = groups.filter((group) => group.useSoon || group.expired).length;

  return (
    <div className="pantry-layout">
      <datalist id="pantry-units"><option value="item" /><option value="pack" /><option value="g" /><option value="kg" /><option value="mL" /><option value="L" /><option value="tub" /><option value="fillet" /></datalist>
      <AddPantryForm products={products} />

      <section className="card pantry-stock-card">
        <div className={styles.stockHeader}>
          <div><p className="eyebrow">CANONICAL INVENTORY</p><h2 className="section-title">{groups.length} grocery {groups.length === 1 ? "item" : "items"}</h2><p className="subtle">Equivalent brands, sizes and receipt entries are grouped under the grocery item you actually have.</p></div>
          <div className={styles.stats}><span className="badge neutral">{inventoryCount} stock records</span>{expiringCount ? <span className="badge warning">{expiringCount} need attention</span> : <span className="badge success">Stock healthy</span>}</div>
        </div>

        {loadError ? <div className="pantry-error" role="alert"><strong>Pantry data is unavailable.</strong><p>Check the PostgreSQL connection and refresh this page.</p></div> : groups.length === 0 ? <div className={styles.empty}><strong>Your pantry is empty.</strong><p>Add your first item using the form.</p></div> : categories.map((category) => {
          const categoryGroups = groups.filter((group) => group.category === category);
          return <section className={styles.category} key={category}><div className={styles.categoryHeading}><h3>{category}</h3><span className="badge neutral">{categoryGroups.length}</span></div><div className={styles.groupGrid}>{categoryGroups.map((group) => <PantryGroupCard group={group} key={group.key} shoppingLists={shoppingLists} />)}</div></section>;
        })}
      </section>
    </div>
  );
}
