"use client";

import { PlannerWorkspace } from "@/components/planner/PlannerWorkspace";
import type { PlannerWorkspaceData } from "@/lib/planner/planner.types";

type PlannerClientProps = {
  data: PlannerWorkspaceData;
  loadError?: boolean;
  shoppingError?: boolean;
};

export function PlannerClient({
  data,
  loadError = false,
  shoppingError = false,
}: PlannerClientProps) {
  return (
    <PlannerWorkspace
      data={data}
      loadError={loadError}
      shoppingError={shoppingError}
    />
  );
}
