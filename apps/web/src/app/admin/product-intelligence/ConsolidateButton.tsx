"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConsolidateButton({ duplicateGroups }: { duplicateGroups: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function consolidate() {
    if (!duplicateGroups || running) return;
    const confirmed = window.confirm(`Merge ${duplicateGroups} high-confidence duplicate group${duplicateGroups === 1 ? "" : "s"}? Linked pantry, receipt, shopping and price records will be moved to the canonical products.`);
    if (!confirmed) return;

    setRunning(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/product-intelligence/consolidate", { method: "POST" });
      const result = await response.json() as { ok?: boolean; error?: string; merged?: number; groups?: Array<{ merged: number }> };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Consolidation failed");
      const changedGroups = result.groups?.filter((group) => group.merged > 0).length ?? 0;
      setStatus(`Merged ${result.merged ?? 0} duplicate product records across ${changedGroups} groups.`);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Consolidation failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button className="button" disabled={!duplicateGroups || running} onClick={consolidate} type="button">
        {running ? "Consolidating…" : `Merge high-confidence duplicates (${duplicateGroups})`}
      </button>
      {status ? <p className="subtle" role="status">{status}</p> : null}
    </div>
  );
}
