"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ProductBarcodePicker } from "@/components/products/ProductBarcodePicker";
import { addBarcodeShoppingItem } from "@/lib/shopping/shopping-barcode.actions";
import {
  addPantryItemToShoppingList,
  clearCompletedShoppingItems,
  createShoppingList,
  deleteShoppingList,
  removeShoppingItem,
  renameShoppingList,
  toggleShoppingItem,
  updateShoppingItem,
} from "@/lib/shopping/shopping.actions";
import {
  initialShoppingActionState,
  type PantryShoppingSuggestion,
  type ShoppingActionState,
  type ShoppingItemView,
  type ShoppingListView,
} from "@/lib/shopping/shopping.types";
import type { ProductCatalogueItem } from "@/lib/products/product-catalogue.types";

const categoryOrder = [
  "Fruit & vegetables",
  "Meat & seafood",
  "Dairy & eggs",
  "Bakery & grains",
  "Frozen",
  "Drinks",
  "Household",
  "Pantry & other",
];

const locationLabels = {
  PANTRY: "Pantry",
  FRIDGE: "Fridge",
  FREEZER: "Freezer",
} as const;

function FieldError({ state, field }: { state: ShoppingActionState; field: string }) {
  const message = state.fieldErrors?.[field];
  return message ? <small className="field-error">{message}</small> : null;
}

function ActionMessage({ state }: { state: ShoppingActionState }) {
  if (state.status === "idle") return null;
  return <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function SubmitButton({ children, pendingText, className = "button" }: { children: React.ReactNode; pendingText: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} type="submit">{pending ? pendingText : children}</button>;
}

function CreateListCard() {
  const [state, action] = useActionState(createShoppingList, initialShoppingActionState);

  return (
    <section className="card shopping-create-card">
      <p className="eyebrow">NEW LIST</p>
      <h2 className="section-title">Create a shopping list</h2>
      <p className="subtle shopping-copy">Use separate lists for your weekly shop, a specific store or an upcoming event.</p>
      <form action={action} className="shopping-form">
        <label className="field">
          <span>List name</span>
          <input aria-invalid={Boolean(state.fieldErrors?.name)} maxLength={80} minLength={2} name="name" placeholder="e.g. Weekly groceries" required />
          <FieldError field="name" state={state} />
        </label>
        <ActionMessage state={state} />
        <SubmitButton pendingText="Creating…">Create list</SubmitButton>
      </form>
    </section>
  );
}

function AddItemForm({ listId, products }: { listId: string; products: ProductCatalogueItem[] }) {
  const actionWithId = addBarcodeShoppingItem.bind(null, listId);
  const [state, action] = useActionState(actionWithId, initialShoppingActionState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <form action={action} className="shopping-add-form" ref={formRef}>
      <div className="shopping-item-name-field">
        <ProductBarcodePicker
          barcodeError={state.fieldErrors?.barcode}
          nameError={state.fieldErrors?.name}
          nameLabel="Product to replace"
          namePlaceholder="Choose a product or scan its barcode"
          products={products}
        />
      </div>
      <label className="field">
        <span>Quantity</span>
        <input aria-invalid={Boolean(state.fieldErrors?.quantity)} defaultValue="1" min="0.01" name="quantity" required step="0.01" type="number" />
        <FieldError field="quantity" state={state} />
      </label>
      <label className="field">
        <span>Unit</span>
        <input aria-invalid={Boolean(state.fieldErrors?.unit)} defaultValue="item" list="shopping-units" maxLength={30} name="unit" required />
        <FieldError field="unit" state={state} />
      </label>
      <ActionMessage state={state} />
      <SubmitButton pendingText="Adding…">Add item</SubmitButton>
    </form>
  );
}

function ShoppingItem({ item, listId }: { item: ShoppingItemView; listId: string }) {
  const updateAction = updateShoppingItem.bind(null, listId, item.id);
  const [state, action] = useActionState(updateAction, initialShoppingActionState);

  return (
    <article className={`shopping-item ${item.checked ? "checked" : ""}`}>
      <form action={toggleShoppingItem.bind(null, listId, item.id)} className="shopping-check-form">
        <input
          aria-label={`Mark ${item.name} ${item.checked ? "not completed" : "completed"}`}
          defaultChecked={item.checked}
          name="nextChecked"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          type="checkbox"
          value="true"
        />
      </form>

      <div className="shopping-item-main">
        <strong>{item.name}</strong>
        <span>{item.quantity ?? "—"} {item.unit ?? ""}</span>
      </div>

      <details className="shopping-item-edit">
        <summary>Edit</summary>
        <form action={action} className="shopping-edit-form">
          <label className="field field-full">
            <span>Item</span>
            <input aria-invalid={Boolean(state.fieldErrors?.name)} defaultValue={item.name} maxLength={100} minLength={2} name="name" required />
            <FieldError field="name" state={state} />
          </label>
          <label className="field">
            <span>Quantity</span>
            <input aria-invalid={Boolean(state.fieldErrors?.quantity)} defaultValue={item.quantity ?? 1} min="0.01" name="quantity" required step="0.01" type="number" />
            <FieldError field="quantity" state={state} />
          </label>
          <label className="field">
            <span>Unit</span>
            <input aria-invalid={Boolean(state.fieldErrors?.unit)} defaultValue={item.unit ?? "item"} list="shopping-units" maxLength={30} name="unit" required />
            <FieldError field="unit" state={state} />
          </label>
          <ActionMessage state={state} />
          <div className="shopping-edit-actions">
            <SubmitButton className="secondary-button" pendingText="Saving…">Save</SubmitButton>
          </div>
        </form>
      </details>

      <form action={removeShoppingItem.bind(null, listId, item.id)}>
        <button aria-label={`Remove ${item.name}`} className="shopping-remove-button" type="submit">×</button>
      </form>
    </article>
  );
}

function RenameList({ list }: { list: ShoppingListView }) {
  const actionWithId = renameShoppingList.bind(null, list.id);
  const [state, action] = useActionState(actionWithId, initialShoppingActionState);

  return (
    <details className="shopping-rename">
      <summary>Rename</summary>
      <form action={action} className="shopping-rename-form">
        <label className="field">
          <span>List name</span>
          <input aria-invalid={Boolean(state.fieldErrors?.name)} defaultValue={list.name} maxLength={80} minLength={2} name="name" required />
          <FieldError field="name" state={state} />
        </label>
        <ActionMessage state={state} />
        <SubmitButton className="secondary-button" pendingText="Saving…">Save name</SubmitButton>
      </form>
    </details>
  );
}

function PantrySuggestion({ item, listId }: { item: PantryShoppingSuggestion; listId: string }) {
  return (
    <article className="shopping-pantry-suggestion">
      <div>
        <strong>{item.name}</strong>
        <span>{item.quantity} {item.unit} left · {locationLabels[item.location]}</span>
      </div>
      <form action={addPantryItemToShoppingList.bind(null, listId, item.id)}>
        <button className="secondary-button" type="submit">Add</button>
      </form>
    </article>
  );
}

export function ShoppingWorkspace({
  lists,
  selectedList,
  pantrySuggestions,
  products,
}: {
  lists: ShoppingListView[];
  selectedList: ShoppingListView | null;
  pantrySuggestions: PantryShoppingSuggestion[];
  products: ProductCatalogueItem[];
}) {
  const groupedItems = selectedList
    ? categoryOrder.map((category) => ({
        category,
        items: selectedList.items.filter((item) => item.category === category),
      })).filter((group) => group.items.length > 0)
    : [];
  const remainingCount = selectedList ? selectedList.totalCount - selectedList.completedCount : 0;

  return (
    <div className="shopping-layout">
      <datalist id="shopping-units">
        <option value="item" /><option value="pack" /><option value="g" /><option value="kg" />
        <option value="mL" /><option value="L" /><option value="tin" /><option value="bunch" />
      </datalist>

      <aside className="shopping-sidebar-stack">
        <CreateListCard />
        <section className="card shopping-list-picker">
          <div className="shopping-section-heading">
            <div><p className="eyebrow">YOUR LISTS</p><h2 className="section-title">Shopping lists</h2></div>
            <span className="badge neutral">{lists.length}</span>
          </div>
          {lists.length === 0 ? (
            <p className="subtle shopping-copy">Create your first list to start planning a shop.</p>
          ) : (
            <nav aria-label="Shopping lists" className="shopping-list-links">
              {lists.map((list) => (
                <Link className={selectedList?.id === list.id ? "active" : ""} href={`/shopping?list=${list.id}`} key={list.id}>
                  <span><strong>{list.name}</strong><small>{list.totalCount - list.completedCount} remaining</small></span>
                  <span>{list.completedCount}/{list.totalCount}</span>
                </Link>
              ))}
            </nav>
          )}
        </section>
      </aside>

      <main className="shopping-main-stack">
        {!selectedList ? (
          <section className="card pantry-empty">
            <strong>No shopping list selected.</strong>
            <p>Create a list to begin adding items.</p>
          </section>
        ) : (
          <>
            <section className="card shopping-list-header">
              <div className="shopping-list-title-row">
                <div>
                  <p className="eyebrow">ACTIVE LIST</p>
                  <h1>{selectedList.name}</h1>
                  <p className="subtle">{remainingCount} remaining · {selectedList.completedCount} completed</p>
                </div>
                <div className="shopping-list-actions">
                  <RenameList list={selectedList} />
                  <form action={deleteShoppingList.bind(null, selectedList.id)}>
                    <button className="danger-button" type="submit">Delete list</button>
                  </form>
                </div>
              </div>
              <div className="shopping-progress-row">
                <div className="progress"><span style={{ width: `${selectedList.totalCount === 0 ? 0 : Math.round((selectedList.completedCount / selectedList.totalCount) * 100)}%` }} /></div>
                <span>{selectedList.totalCount === 0 ? 0 : Math.round((selectedList.completedCount / selectedList.totalCount) * 100)}%</span>
              </div>
              <AddItemForm listId={selectedList.id} products={products} />
            </section>

            {selectedList.items.length === 0 ? (
              <section className="card pantry-empty"><strong>Your list is empty.</strong><p>Add an item above, scan an empty package or use a low-stock Pantry suggestion.</p></section>
            ) : (
              <section className="shopping-groups">
                {groupedItems.map((group) => (
                  <section className="card shopping-category" key={group.category}>
                    <div className="shopping-section-heading">
                      <h2 className="section-title">{group.category}</h2>
                      <span className="badge neutral">{group.items.length}</span>
                    </div>
                    <div className="shopping-items">
                      {group.items.map((item) => <ShoppingItem item={item} key={item.id} listId={selectedList.id} />)}
                    </div>
                  </section>
                ))}
              </section>
            )}

            {selectedList.completedCount > 0 ? (
              <section className="shopping-clear-row">
                <form action={clearCompletedShoppingItems.bind(null, selectedList.id)}>
                  <button className="danger-button" type="submit">Clear {selectedList.completedCount} completed</button>
                </form>
              </section>
            ) : null}

            <section className="card shopping-pantry-card">
              <div className="shopping-section-heading">
                <div><p className="eyebrow">FROM PANTRY</p><h2 className="section-title">Low-stock suggestions</h2></div>
                <Link className="secondary-button" href="/pantry">View Pantry</Link>
              </div>
              {pantrySuggestions.length === 0 ? (
                <p className="subtle shopping-copy">No Pantry items are currently at or below the low-stock threshold.</p>
              ) : (
                <div className="shopping-pantry-list">
                  {pantrySuggestions.map((item) => <PantrySuggestion item={item} key={item.id} listId={selectedList.id} />)}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
