"use client";

import { useEffect, useState } from "react";
import { PlannerWorkspace } from "@/components/planner/PlannerWorkspace";
import type { PlannerWorkspaceData } from "@/lib/planner/planner.types";

type PlannerClientProps = {
  data: PlannerWorkspaceData;
  loadError?: boolean;
  shoppingError?: boolean;
};

export function PlannerClient({ data, loadError = false, shoppingError = false }: PlannerClientProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Keep the server HTML and first browser render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <section className="card pantry-empty" aria-live="polite">
        <strong>Loading your planner…</strong>
        <p>Restoring this week&apos;s meal selections from this device.</p>
      </section>
    );
  }

  return <PlannerWorkspace data={data} loadError={loadError} shoppingError={shoppingError} />;
}
