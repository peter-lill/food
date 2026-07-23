"use client";

import { useSyncExternalStore } from "react";
import { PlannerWorkspace } from "@/components/planner/PlannerWorkspace";
import type { PlannerWorkspaceData } from "@/lib/planner/planner.types";

const subscribe = () => () => {};

function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

type PlannerClientProps = {
  data: PlannerWorkspaceData;
  loadError?: boolean;
  shoppingError?: boolean;
};

export function PlannerClient({ data, loadError = false, shoppingError = false }: PlannerClientProps) {
  const hydrated = useHydrated();

  if (!hydrated) {
    return (
      <section className="card pantry-empty" aria-live="polite">
        <strong>Loading your planner…</strong>
        <p>Restoring this week&apos;s meal selections from this device.</p>
      </section>
    );
  }

  return <PlannerWorkspace data={data} loadError={loadError} shoppingError={shoppingError} />;
}
