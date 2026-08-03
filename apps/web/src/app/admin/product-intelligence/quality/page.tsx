import Link from "next/link";
import { getCatalogueQualityMetrics } from "@/lib/product-intelligence/product-quality-engine";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.replaceAll("-", " ").replace(/(^|\s)([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

export default async function ProductQualityDashboardPage() {
  const metrics = await getCatalogueQualityMetrics();

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ADMIN · AUSTRALIAN PRODUCT KNOWLEDGE</p>
          <h1 className="page-title">Product quality</h1>
          <p className="subtle">Validation status, confidence and actionable catalogue issues.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="secondary-button" href="/admin/product-intelligence/labels">Australian labels</Link>
          <Link className="secondary-button" href="/admin/product-intelligence">Catalogue Manager</Link>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <article className="card"><p className="eyebrow">PRODUCTS</p><h2>{metrics.products}</h2><p className="subtle">Inspected catalogue records</p></article>
        <article className="card"><p className="eyebrow">AVERAGE SCORE</p><h2>{metrics.averageScore}%</h2><p className="subtle">Validation-weighted confidence</p></article>
        <article className="card"><p className="eyebrow">VERIFIED</p><h2>{metrics.verified}</h2><p className="subtle">No outstanding quality issues</p></article>
        <article className="card"><p className="eyebrow">INCOMPLETE</p><h2>{metrics.incomplete}</h2><p className="subtle">Warnings or informational gaps</p></article>
        <article className="card"><p className="eyebrow">REVIEW</p><h2>{metrics.review}</h2><p className="subtle">One or more validation errors</p></article>
        <article className="card"><p className="eyebrow">BROKEN</p><h2>{metrics.broken}</h2><p className="subtle">Invalid canonical identity</p></article>
      </section>

      <section className="card">
        <div className="dashboard-card-heading">
          <div><p className="eyebrow">QUALITY ISSUES</p><h2 className="section-title">Catalogue-wide validation failures</h2></div>
        </div>
        {metrics.issues.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {metrics.issues.map((item) => (
              <article key={item.code} style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 14 }}>
                <strong>{label(item.code)}</strong>
                <p className="subtle" style={{ marginBottom: 0 }}>{item.count} product{item.count === 1 ? "" : "s"}</p>
              </article>
            ))}
          </div>
        ) : <p className="subtle">No catalogue quality issues were detected.</p>}
      </section>

      <section className="card">
        <div className="dashboard-card-heading">
          <div><p className="eyebrow">PRIORITY QUEUE</p><h2 className="section-title">Lowest-confidence products</h2></div>
          <span className="badge warning">{metrics.weakest.length} shown</span>
        </div>
        {metrics.weakest.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {metrics.weakest.map((product) => (
              <article key={product.productId} style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", padding: 14, border: "1px solid var(--line)", borderRadius: 14 }}>
                <div>
                  <Link href={`/products/${encodeURIComponent(product.productId)}`}><strong>{product.name}</strong></Link>
                  <p className="subtle" style={{ margin: "5px 0 0" }}>{product.state} · {product.score}% confidence</p>
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                  {product.issues.slice(0, 5).map((item) => <span className={`badge ${item.severity === "error" ? "warning" : "neutral"}`} key={item.code}>{item.label}</span>)}
                  <Link className="secondary-button" href={`/admin/product-intelligence/inspector?productId=${encodeURIComponent(product.productId)}`}>Inspect</Link>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="subtle">No products require quality review.</p>}
      </section>
    </main>
  );
}
