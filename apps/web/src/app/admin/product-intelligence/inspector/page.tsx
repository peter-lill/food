import Link from "next/link";
import { inspectProductQuality } from "@/lib/product-intelligence/product-quality-engine";
import { getProductFieldHistory } from "@/lib/product-intelligence/product-repair-workflow";
import { rollbackNameChangeAction } from "../repairs/actions";

export const dynamic = "force-dynamic";

type InspectorPageProps = { searchParams: Promise<{ productId?: string }> };

export default async function ProductKnowledgeInspectorPage({ searchParams }: InspectorPageProps) {
  const { productId } = await searchParams;
  const [inspection, history] = productId
    ? await Promise.all([inspectProductQuality(productId), getProductFieldHistory(productId)])
    : [null, []];

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ADMIN · AUSTRALIAN PRODUCT KNOWLEDGE</p>
          <h1 className="page-title">Product Knowledge Inspector</h1>
          <p className="subtle">Inspect canonical quality, validation, enrichment and reversible identity history for one product.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="secondary-button" href="/admin/product-intelligence/repairs">Repair queue</Link>
          <Link className="secondary-button" href="/admin/product-intelligence/quality">Quality dashboard</Link>
          <Link className="secondary-button" href="/admin/product-intelligence/diagnostics">Provider diagnostics</Link>
        </div>
      </header>

      {!productId ? (
        <section className="card">
          <h2 className="section-title">Choose a product</h2>
          <p className="subtle">Open this page from Product Quality, Catalogue Manager or the Repair Queue.</p>
        </section>
      ) : !inspection ? (
        <section className="pantry-error"><strong>Product not found.</strong><p>The requested product could not be inspected.</p></section>
      ) : (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <article className="card"><p className="eyebrow">CONFIDENCE</p><h2>{inspection.score}%</h2><p className="subtle">{inspection.state}</p></article>
            <article className="card"><p className="eyebrow">PRODUCT TYPE</p><h2 style={{ fontSize: 20 }}>{inspection.productType.replaceAll("_", " ")}</h2><p className="subtle">Lifecycle: {inspection.lifecycle}</p></article>
            <article className="card"><p className="eyebrow">RETAIL COVERAGE</p><h2>{inspection.retailerCount}</h2><p className="subtle">{inspection.activeRetailerLinks} active linked listing{inspection.activeRetailerLinks === 1 ? "" : "s"}</p></article>
          </section>

          <section className="card">
            <div className="dashboard-card-heading">
              <div><p className="eyebrow">CANONICAL IDENTITY</p><h2 className="section-title">{inspection.name}</h2></div>
              <Link className="secondary-button" href={`/products/${encodeURIComponent(inspection.productId)}`}>Open product</Link>
            </div>
            {inspection.sanitisedName && inspection.sanitisedName !== inspection.name ? (
              <div style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 14 }}>
                <strong>Suggested clean name</strong>
                <p style={{ marginBottom: 10 }}>{inspection.sanitisedName}</p>
                <Link className="secondary-button" href="/admin/product-intelligence/repairs">Review in Repair Queue</Link>
              </div>
            ) : <p className="subtle">The canonical name passes the current sanitisation rules.</p>}
          </section>

          <section className="card">
            <div className="dashboard-card-heading"><div><p className="eyebrow">VALIDATION</p><h2 className="section-title">Outstanding issues</h2></div><span className={`badge ${inspection.issues.length ? "warning" : "neutral"}`}>{inspection.issues.length}</span></div>
            {inspection.issues.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {inspection.issues.map((item) => (
                  <article key={item.code} style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap", padding: 14, border: "1px solid var(--line)", borderRadius: 14 }}>
                    <div><strong>{item.label}</strong><p className="subtle" style={{ margin: "4px 0 0" }}>Field: {item.field} · Code: {item.code}</p></div>
                    <div style={{ display: "flex", gap: 7, alignItems: "center" }}><span className={`badge ${item.severity === "error" ? "warning" : "neutral"}`}>{item.severity}</span>{item.repairable ? <span className="badge neutral">Reviewable repair</span> : null}</div>
                  </article>
                ))}
              </div>
            ) : <p className="subtle">No validation issues were detected.</p>}
          </section>

          <section className="card">
            <div className="dashboard-card-heading"><div><p className="eyebrow">FIELD HISTORY</p><h2 className="section-title">Canonical name changes</h2></div><span className="badge neutral">{history.length}</span></div>
            {history.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {history.map((entry, index) => {
                  const canRollback = index === 0 && inspection.name === entry.nextValue;
                  return (
                    <article key={entry.id} style={{ display: "grid", gap: 10, padding: 14, border: "1px solid var(--line)", borderRadius: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div>
                          <strong>{entry.action === "rollback" ? "Rolled back" : "Approved change"}</strong>
                          <p className="subtle" style={{ margin: "4px 0 0" }}>{entry.changedAt.toLocaleString("en-AU")} · {entry.actorEmail}</p>
                        </div>
                        <span className="badge neutral">{entry.rule}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", gap: 10, alignItems: "center" }}>
                        <div style={{ padding: 12, borderRadius: 12, background: "var(--surface-soft)" }}><small className="subtle">Previous</small><strong style={{ display: "block", marginTop: 4 }}>{entry.previousValue}</strong></div>
                        <span aria-hidden="true">→</span>
                        <div style={{ padding: 12, borderRadius: 12, background: "var(--surface-soft)" }}><small className="subtle">New</small><strong style={{ display: "block", marginTop: 4 }}>{entry.nextValue}</strong></div>
                      </div>
                      {canRollback ? (
                        <form action={rollbackNameChangeAction}>
                          <input name="historyId" type="hidden" value={entry.id} />
                          <button className="secondary-button" type="submit">Restore previous name</button>
                        </form>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : <p className="subtle">No approved canonical-name changes have been recorded.</p>}
          </section>

          <section className="card">
            <div className="dashboard-card-heading"><div><p className="eyebrow">PASSED CHECKS</p><h2 className="section-title">Validated knowledge</h2></div><span className="badge neutral">{inspection.passed.length}</span></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{inspection.passed.map((item) => <span className="badge neutral" key={item}>✓ {item}</span>)}</div>
          </section>

          <section className="card">
            <div className="dashboard-card-heading"><div><p className="eyebrow">LATEST ENRICHMENT</p><h2 className="section-title">Provider state</h2></div></div>
            {inspection.latestEnrichment ? (
              <div style={{ display: "grid", gap: 6 }}>
                <p><strong>Provider:</strong> {inspection.latestEnrichment.provider}</p>
                <p><strong>Status:</strong> {inspection.latestEnrichment.status}</p>
                <p><strong>Completed:</strong> {inspection.latestEnrichment.completedAt ? inspection.latestEnrichment.completedAt.toLocaleString("en-AU") : "Not completed"}</p>
                {inspection.latestEnrichment.lastError ? <p className="subtle"><strong>Last error:</strong> {inspection.latestEnrichment.lastError}</p> : null}
              </div>
            ) : <p className="subtle">No enrichment job has been recorded for this product.</p>}
          </section>
        </>
      )}
    </main>
  );
}
