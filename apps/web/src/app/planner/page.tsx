import { PlannerClient } from "./PlannerClient";
import { requireAuthSession } from "@/lib/auth-session";
import { getPlannerWorkspace } from "@/lib/planner/planner.repository";
import { currentPlannerWeekStart } from "@/lib/planner/planner-week";
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
  weekStart: currentPlannerWeekStart().toISOString(),
  plan: {},
  dayAvailability: {},
  missingIngredients: [],
};

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ shoppingError?: string | string[] }>;
}) {
  const params = await searchParams;
  const session = await requireAuthSession();
  const result = await getPlannerWorkspace(session.user.id)
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
