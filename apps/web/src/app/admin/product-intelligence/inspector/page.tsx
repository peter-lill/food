import Link from "next/link";
import { inspectProductQuality } from "@/lib/product-intelligence/product-quality-engine";

export const dynamic = "force-dynamic";

type InspectorPageProps = { searchParams: Promise<{ productId?: string }> };

export default async function ProductKnowledgeInspectorPage({ searchParams }: InspectorPageProps) {
  const { productId } = await searchParams;
  const inspection = productId ? await inspectProductQuality(productId) : null;

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ADMIN · AUSTRALIAN PRODUCT KNOWLEDGE</p>
          <h1 className="page-title">Product Knowledge Inspector</h1>
          <p className="subtle">Inspect canonical quality, validation failures and enrichment state for one product.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="secondary-button" href="/admin/product-intelligence/quality">Quality dashboard</Link>
          <Link className="secondary-button" href="/admin/product-intelligence/diagnostics">Provider diagnostics</Link>
        </div>
      </header>

      {!productId ? (
        <section className="card">
          <h2 className="section-title">Choose a product</h2>
          <p className="subtle">Open this page from the Product Quality queue or add <code>?productId=...</code> to the URL.</p>
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
                <p style={{ marginBottom: 0 }}>{inspection.sanitisedName}</p>
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
                    <div style={{ display: "flex", gap: 7, alignItems: "center" }}><span className={`badge ${item.severity === "error" ? "warning" : "neutral"}`}>{item.severity}</span>{item.repairable ? <span className="badge neutral">Auto-repairable</span> : null}</div>
                  </article>
                ))}
              </div>
            ) : <p className="subtle">No validation issues were detected.</p>}
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
