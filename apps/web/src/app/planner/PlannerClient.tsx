"use client";

import dynamic from "next/dynamic";

import type { PlannerWorkspaceData } from "@/lib/planner/planner.types";

const PlannerWorkspace = dynamic(
  () =>
    import("@/components/planner/PlannerWorkspace").then(
      (module) => module.PlannerWorkspace,
    ),
  {
    ssr: false,
    loading: () => (
      <section className="card pantry-empty" aria-live="polite">
        <strong>Loading your planner…</strong>
        <p>Restoring meal, preparation and hydration progress from this device.</p>
      </section>
    ),
  },
);

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
