"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Proposal = {
  key: string;
  action: "RENAME" | "MERGE" | "REVIEW";
  productId: string;
  productName: string;
  targetProductId: string | null;
  targetProductName: string | null;
  suggestedName: string;
  confidence: number;
  evidence: string[];
  impact: Record<string, number>;
};

type Simulation = {
  engineVersion: string;
  generatedAt: string;
  scanned: number;
  automatic: number;
  review: number;
  renames: number;
  merges: number;
  proposals: Proposal[];
};

function impactLabel(impact: Record<string, number>) {
  const total = Object.values(impact).reduce((sum, value) => sum + value, 0);
  return total ? `${total} linked record${total === 1 ? "" : "s"} affected` : "No linked records";
}

export function RepairSimulation() {
  const router = useRouter();
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [running, setRunning] = useState(false);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function runSimulation() {
    setRunning(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/product-intelligence/simulate", { method: "POST" });
      const result = await response.json() as { ok?: boolean; error?: string; simulation?: Simulation };
      if (!response.ok || !result.ok || !result.simulation) throw new Error(result.error ?? "Simulation failed");
      setSimulation(result.simulation);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  }

  async function approve(proposal: Proposal) {
    if (proposal.action === "REVIEW" || workingKey) return;
    const description = proposal.action === "MERGE"
      ? `Merge “${proposal.productName}” into “${proposal.targetProductName}”?`
      : `Rename “${proposal.productName}” to “${proposal.suggestedName}”?`;
    if (!window.confirm(description)) return;

    setWorkingKey(proposal.key);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/product-intelligence/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: proposal.action,
          productId: proposal.productId,
          targetProductId: proposal.targetProductId,
          suggestedName: proposal.suggestedName,
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Repair failed");
      setSimulation((current) => current
        ? { ...current, proposals: current.proposals.filter((item) => item.key !== proposal.key) }
        : current);
      setStatus(`${proposal.action === "MERGE" ? "Merged" : "Renamed"} successfully.`);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Repair failed");
    } finally {
      setWorkingKey(null);
    }
  }

  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow">GROCERY INTELLIGENCE · SIMULATION MODE</p>
          <h2>Catalogue repair preview</h2>
          <p className="subtle">Scan the active catalogue without changing data. Approve each high-confidence repair individually.</p>
        </div>
        <button className="primary-button" disabled={running} onClick={runSimulation} type="button">
          {running ? "Analysing catalogue…" : simulation ? "Run simulation again" : "Run repair simulation"}
        </button>
      </div>

      {status ? <p className="subtle" role="status">{status}</p> : null}

      {simulation ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
            <div><small>Engine</small><strong style={{ display: "block" }}>v{simulation.engineVersion}</strong></div>
            <div><small>Scanned</small><strong style={{ display: "block" }}>{simulation.scanned}</strong></div>
            <div><small>Automatic</small><strong style={{ display: "block" }}>{simulation.automatic}</strong></div>
            <div><small>Manual review</small><strong style={{ display: "block" }}>{simulation.review}</strong></div>
            <div><small>Renames</small><strong style={{ display: "block" }}>{simulation.renames}</strong></div>
            <div><small>Merges</small><strong style={{ display: "block" }}>{simulation.merges}</strong></div>
          </div>

          <div style={{ display: "grid", gap: "0.8rem", marginTop: "1.25rem" }}>
            {simulation.proposals.slice(0, 100).map((proposal) => (
              <article key={proposal.key} style={{ border: "1px solid var(--border)", borderRadius: "16px", padding: "1rem", display: "grid", gap: "0.65rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <small>{proposal.action}</small>
                    <strong style={{ display: "block" }}>{proposal.productName}</strong>
                    <span className="subtle">→ {proposal.action === "MERGE" ? proposal.targetProductName : proposal.suggestedName}</span>
                  </div>
                  <strong>{Math.round(proposal.confidence * 100)}%</strong>
                </div>
                <p className="subtle" style={{ margin: 0 }}>{proposal.evidence.join(" · ")}</p>
                <small>{impactLabel(proposal.impact)}</small>
                {proposal.action !== "REVIEW" ? (
                  <div>
                    <button className="button" disabled={workingKey === proposal.key} onClick={() => approve(proposal)} type="button">
                      {workingKey === proposal.key ? "Applying…" : `Approve ${proposal.action.toLocaleLowerCase("en-AU")}`}
                    </button>
                  </div>
                ) : <small>Manual identity review required.</small>}
              </article>
            ))}
            {!simulation.proposals.length ? <p className="subtle">No catalogue repairs are currently suggested.</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
