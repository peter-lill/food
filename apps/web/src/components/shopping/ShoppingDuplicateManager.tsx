import { mergeShoppingDuplicates } from "@/lib/shopping/shopping-duplicate.actions";
import type { ShoppingListView } from "@/lib/shopping/shopping.types";

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function ShoppingDuplicateManager({ list }: { list: ShoppingListView | null }) {
  if (!list || list.items.length < 2) return null;

  const groups = new Map<string, typeof list.items>();
  for (const item of list.items.filter((entry) => !entry.checked)) {
    const key = normalise(item.name);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const exactDuplicates = [...groups.values()].filter((group) => group.length > 1);

  return (
    <section className="card">
      <p className="eyebrow">LIST CLEANUP</p>
      <h2 className="section-title">Merge duplicate items</h2>
      <p className="subtle">
        Combine any two entries on this list, including manually entered items that are not linked to Pantry products.
      </p>
      {exactDuplicates.length ? (
        <p className="form-message success">
          Food found {exactDuplicates.reduce((sum, group) => sum + group.length - 1, 0)} likely duplicate{exactDuplicates.reduce((sum, group) => sum + group.length - 1, 0) === 1 ? "" : "s"}.
        </p>
      ) : null}
      <form action={mergeShoppingDuplicates.bind(null, list.id)} className="shopping-add-form">
        <label className="field">
          <span>Keep this item</span>
          <select name="keepId" required>
            <option value="">Choose item</option>
            {list.items.filter((item) => !item.checked).map((item) => (
              <option key={item.id} value={item.id}>{item.displayName} · {item.quantity ?? 1} {item.unit ?? "item"}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Merge this duplicate into it</span>
          <select name="duplicateId" required>
            <option value="">Choose duplicate</option>
            {list.items.filter((item) => !item.checked).map((item) => (
              <option key={item.id} value={item.id}>{item.displayName} · {item.quantity ?? 1} {item.unit ?? "item"}</option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="submit">Merge items</button>
      </form>
    </section>
  );
}
