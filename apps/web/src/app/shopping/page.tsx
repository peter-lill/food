import Link from "next/link";
import { ShoppingDuplicateManager } from "@/components/shopping/ShoppingDuplicateManager";
import { ShoppingWorkspace } from "@/components/shopping/ShoppingWorkspace";
import { getShoppingWorkspace } from "@/lib/shopping/shopping.repository";

export const dynamic = "force-dynamic";

async function loadShoppingPageData() {
  try {
    return await getShoppingWorkspace();
  } catch (error) {
    console.error("Unable to load shopping workspace", error);
    return null;
  }
}

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedListId = Array.isArray(params.list) ? params.list[0] : params.list;
  const workspace = await loadShoppingPageData();

  if (!workspace) {
    return (
      <div className="shopping-page">
        <h1 className="page-title">Shopping</h1>
        <div className="card pantry-error" role="alert">
          <strong>Shopping data is unavailable.</strong>
          <p>Check the PostgreSQL connection and refresh this page.</p>
        </div>
      </div>
    );
  }

  const selectedList = workspace.lists.find((list) => list.id === requestedListId) ?? workspace.lists[0] ?? null;

  return (
    <div className="shopping-page">
      <header className="pantry-page-heading">
        <div>
          <h1 className="page-title">Shopping</h1>
          <p className="subtle">Plan, organise and check off your shop from any device.</p>
        </div>
        <Link className="secondary-button" href="/prices">Compare receipt prices</Link>
      </header>
      <ShoppingDuplicateManager list={selectedList} />
      <ShoppingWorkspace
        lists={workspace.lists}
        pantrySuggestions={workspace.pantrySuggestions}
        products={workspace.products}
        selectedList={selectedList}
      />
    </div>
  );
}
