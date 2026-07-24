"use client";

import dynamic from "next/dynamic";

import type { PlannerWorkspaceData } from "@/lib/planner/planner.types";

const PlannerWorkspace = dynamic(
  () => import("./PlannerWorkspace").then((module) => module.PlannerWorkspace),
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

export function PlannerClient(props: PlannerClientProps) {
  void props;
  return <PlannerWorkspace />;
}
