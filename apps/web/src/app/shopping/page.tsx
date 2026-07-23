import { ShoppingWorkspace } from "@/components/shopping/ShoppingWorkspace";
import { getShoppingWorkspace } from "@/lib/shopping/shopping.repository";

export const dynamic = "force-dynamic";

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedListId = Array.isArray(params.list) ? params.list[0] : params.list;

  try {
    const workspace = await getShoppingWorkspace();
    const selectedList = workspace.lists.find((list) => list.id === requestedListId) ?? workspace.lists[0] ?? null;

    return (
      <>
        <header className="pantry-page-heading">
          <div>
            <h1 className="page-title">Shopping</h1>
            <p className="subtle">Plan, organise and check off your shop from any device.</p>
          </div>
          <span className="badge neutral">PostgreSQL</span>
        </header>
        <ShoppingWorkspace
          lists={workspace.lists}
          pantrySuggestions={workspace.pantrySuggestions}
          selectedList={selectedList}
        />
      </>
    );
  } catch (error) {
    console.error("Unable to load shopping workspace", error);
    return (
      <>
        <h1 className="page-title">Shopping</h1>
        <div className="card pantry-error" role="alert">
          <strong>Shopping data is unavailable.</strong>
          <p>Check the PostgreSQL connection and refresh this page.</p>
        </div>
      </>
    );
  }
}
