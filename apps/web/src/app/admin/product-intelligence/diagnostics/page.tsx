import Link from "next/link";
import { getProductProviderDiagnostics } from "@/lib/product-intelligence/provider-diagnostics";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ productId?: string }> };

function status(value: boolean) {
  return value ? "✓" : "✕";
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ProductProviderDiagnosticsPage({ searchParams }: PageProps) {
  const { productId = "" } = await searchParams;
  const diagnostics = productId ? await getProductProviderDiagnostics(productId) : null;

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ADMIN · AUSTRALIAN PRODUCT KNOWLEDGE</p>
          <h1 className="page-title">Provider diagnostics</h1>
          <p className="subtle">Inspect retailer connectivity and determine whether label fields exist in the downloaded retailer page.</p>
        </div>
        <Link className="secondary-button" href="/admin/product-intelligence/labels">Australian labels</Link>
      </header>

      <section className="card">
        <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
          <label className="field" style={{ flex: "1 1 320px" }}>
            <span>Product ID</span>
            <input defaultValue={productId} name="productId" placeholder="Paste a Product ID" required />
          </label>
          <button className="primary-button" type="submit">Run diagnostics</button>
        </form>
      </section>

      {!productId ? (
        <section className="card"><p className="subtle">Open this page from the Australian labels review queue or enter a Product ID above.</p></section>
      ) : !diagnostics ? (
        <section className="pantry-error"><strong>Product not found.</strong><p>Check the Product ID and try again.</p></section>
      ) : (
        <>
          <section className="card">
            <div className="dashboard-card-heading">
              <div>
                <p className="eyebrow">CANONICAL PRODUCT</p>
                <h2 className="section-title">{diagnostics.product.name}</h2>
              </div>
              <Link className="secondary-button" href={`/products/${encodeURIComponent(diagnostics.product.id)}`}>Open product</Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <article><small>Product type</small><p><strong>{diagnostics.product.productType.replaceAll("_", " ")}</strong></p></article>
              <article><small>Serving size</small><p><strong>{diagnostics.product.servingSize ?? "Missing"}</strong></p></article>
              <article><small>Servings/package</small><p><strong>{diagnostics.product.servingsPerPackage ?? "Missing"}</strong></p></article>
              <article><small>Nutrition</small><p><strong>{diagnostics.product.nutritionRecorded ? "Recorded" : "Missing"}</strong></p></article>
              <article><small>Ingredients</small><p><strong>{diagnostics.product.ingredientsText ? "Recorded" : "Missing"}</strong></p></article>
              <article><small>Allergens</small><p><strong>{diagnostics.product.allergens.length || diagnostics.product.mayContainAllergens.length ? "Recorded" : "Missing"}</strong></p></article>
            </div>
            {diagnostics.missingCanonicalFields.length ? (
              <p style={{ marginTop: 14 }}><strong>Missing canonical fields:</strong> {diagnostics.missingCanonicalFields.join(" · ")}</p>
            ) : <p style={{ marginTop: 14 }}><strong>Canonical label is complete.</strong></p>}
          </section>

          <section className="card">
            <div className="dashboard-card-heading">
              <div><p className="eyebrow">RETAILER PROVIDERS</p><h2 className="section-title">Downloaded page markers</h2></div>
              <span className="badge neutral">{diagnostics.providers.length} listing{diagnostics.providers.length === 1 ? "" : "s"}</span>
            </div>
            {diagnostics.providers.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                {diagnostics.providers.map((provider) => (
                  <article key={`${provider.retailer}-${provider.sourceUrl}`} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 16, display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div><strong>{provider.retailer}</strong><p className="subtle" style={{ margin: "4px 0 0" }}>{provider.downloaded ? `HTTP ${provider.httpStatus} · ${formatBytes(provider.responseBytes)} · ${provider.durationMs} ms` : provider.error}</p></div>
                      <a className="secondary-button" href={provider.sourceUrl} rel="noreferrer" target="_blank">Open retailer page</a>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                      <span>{status(provider.markers.structuredData)} Structured data</span>
                      <span>{status(provider.markers.nutrition)} Nutrition</span>
                      <span>{status(provider.markers.servingSize)} Serving size</span>
                      <span>{status(provider.markers.servingsPerPackage)} Servings/package</span>
                      <span>{status(provider.markers.ingredients)} Ingredients</span>
                      <span>{status(provider.markers.contains)} Contains</span>
                      <span>{status(provider.markers.mayContain)} May contain</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="subtle">No active Coles or Woolworths product URLs are linked to this product.</p>}
          </section>

          <section className="card">
            <p className="eyebrow">INTERPRETATION</p>
            <p className="subtle">A ✓ means the downloaded retailer response contains a recognisable marker. If the marker exists but the canonical field is missing, the parser needs improvement. If the marker is absent, the retailer may return client-rendered data, block the request, or no longer publish that field.</p>
          </section>
        </>
      )}
    </main>
  );
}
