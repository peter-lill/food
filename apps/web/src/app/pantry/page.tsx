import { PantryManager } from "@/components/pantry/PantryManager";
import { getPantryItems } from "@/lib/pantry/pantry.repository";

export const dynamic = "force-dynamic";

async function loadPantryPageData() {
  try {
    return { items: await getPantryItems(), loadError: false };
  } catch (error) {
    console.error("Unable to load pantry", error);
    return { items: [], loadError: true };
  }
}

export default async function PantryPage() {
  const { items, loadError } = await loadPantryPageData();

  return (
    <>
      <header className="pantry-page-heading">
        <div>
          <p className="eyebrow">FOOD STOCK</p>
          <h1 className="page-title">Pantry</h1>
          <p className="subtle">Manage pantry, fridge and freezer stock in one place.</p>
        </div>
      </header>
      <PantryManager items={items} loadError={loadError} />
    </>
  );
}
