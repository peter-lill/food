import { PantryManager } from "@/components/pantry/PantryManager";
import { getPantryItems } from "@/lib/pantry/pantry.repository";

export const dynamic = "force-dynamic";

export default async function PantryPage() {
  let loadError = false;
  const items = await getPantryItems().catch((error) => {
    console.error("Unable to load pantry", error);
    loadError = true;
    return [];
  });

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
