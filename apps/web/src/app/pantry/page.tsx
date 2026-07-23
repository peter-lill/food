import { PantryManager } from "@/components/pantry/PantryManager";
import { getPantryItems } from "@/lib/pantry/pantry.repository";
import { getProductCatalogue } from "@/lib/products/product-catalogue.repository";
import { getShoppingListOptions } from "@/lib/shopping/shopping.repository";

export const dynamic = "force-dynamic";

async function loadPantryPageData() {
  try {
    const [items, products, shoppingLists] = await Promise.all([
      getPantryItems(),
      getProductCatalogue(),
      getShoppingListOptions(),
    ]);
    return { items, products, shoppingLists, loadError: false };
  } catch (error) {
    console.error("Unable to load pantry", error);
    return { items: [], products: [], shoppingLists: [], loadError: true };
  }
}

export default async function PantryPage() {
  const { items, products, shoppingLists, loadError } = await loadPantryPageData();

  return (
    <>
      <header className="pantry-page-heading">
        <div>
          <p className="eyebrow">FOOD STOCK</p>
          <h1 className="page-title">Pantry</h1>
          <p className="subtle">Manage pantry, fridge and freezer stock in one place.</p>
        </div>
      </header>
      <PantryManager
        items={items}
        loadError={loadError}
        products={products}
        shoppingLists={shoppingLists}
      />
    </>
  );
}
