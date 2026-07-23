import { PlannerClient } from "./PlannerClient";
import { getPlannerWorkspace } from "@/lib/planner/planner.repository";
import type { PlannerWorkspaceData } from "@/lib/planner/planner.types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Food Meal Planner",
  description: "Plan weekly meals from Recipes and Pantry, then send missing ingredients to Shopping.",
};

const emptyData: PlannerWorkspaceData = {
  recipes: [],
  pantryItems: [],
  shoppingLists: [],
};

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ shoppingError?: string | string[] }>;
}) {
  const params = await searchParams;
  const result = await getPlannerWorkspace()
    .then((data) => ({ data, loadError: false }))
    .catch((error) => {
      console.error("Unable to load Planner workspace", error);
      return { data: emptyData, loadError: true };
    });

  return (
    <PlannerClient
      data={result.data}
      loadError={result.loadError}
      shoppingError={Boolean(params.shoppingError)}
    />
  );
}