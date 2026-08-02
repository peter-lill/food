import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getCatalogueLabelAudit, runCatalogueLabelEnrichmentBatch } from "@/lib/product-intelligence/catalogue-label-enrichment";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.replaceAll("-", " ").replace(/(^|\s)([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

async function enrichBatch(formData: FormData) {
  "use server";
  const requested = Number(formData.get("batchSize") ?? 20);
  const batchSize = Number.isFinite(requested) ? Math.max(1, Math.min(Math.floor(requested), 50)) : 20;
  await runCatalogueLabelEnrichmentBatch(batchSize);
  revalidatePath("/admin/product-intelligence/labels");
  revalidatePath("/admin/product-intelligence");
  revalidatePath("/products");
}

export default async function AustralianProductLabelsPage() {
  const audit = await getCatalogueLabelAudit(1000);
  const incomplete = audit.products.filter((product) => product.missing.length > 0);

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <header className="page-header">
        <div>
          <p className="eyebrow">ADMIN · AUSTRALIAN PRODUCT KNOWLEDGE</p>
          <h1 className="page-title">Australian product labels</h1>
          <p className="subtle">Audit and re-enrich every packaged product linked to Coles or Woolworths.</p>
        </div>
        <Link className="secondary-button" href="/admin/product-intelligence">Catalogue Manager</Link>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <article className="card"><p className="eyebrow">LINKED PRODUCTS</p><h2>{audit.linkedProducts}</h2><p className="subtle">With an active Australian retailer URL</p></article>
        <article className="card"><p className="eyebrow">COMPLETE</p><h2>{audit.completeProducts}</h2><p className="subtle">All expected label fields recorded</p></article>
        <article className="card"><p className="eyebrow">NEEDS ENRICHMENT</p><h2>{audit.needsEnrichment}</h2><p className="subtle">Missing one or more label fields</p></article>
        <article className="card"><p className="eyebrow">MISSING SERVING SIZE</p><h2>{audit.missingServingSize}</h2><p className="subtle">Serving size not stored</p></article>
        <article className="card"><p className="eyebrow">MISSING NUTRITION</p><h2>{audit.missingNutrition}</h2><p className="subtle">No usable NIP values</p></article>
        <article className="card"><p className="eyebrow">MISSING INGREDIENTS</p><h2>{audit.missingIngredients}</h2><p className="subtle">Ingredient statement not stored</p></article>
      </section>

      <section className="card">
        <div className="dashboard-card-heading">
          <div>
            <p className="eyebrow">BULK ENRICHMENT</p>
            <h2 className="section-title">Process incomplete products</h2>
            <p className="subtle">Runs Coles and Woolworths providers, merges fields independently and saves the canonical label.</p>
          </div>
        </div>
        <form action={enrichBatch} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
          <label className="field" style={{ maxWidth: 180 }}>
            <span>Batch size</span>
            <input defaultValue="20" max="50" min="1" name="batchSize" type="number" />
          </label>
          <button className="primary-button" type="submit">Enrich next batch</button>
        </form>
      </section>

      <section className="card">
        <div className="dashboard-card-heading">
          <div><p className="eyebrow">REVIEW QUEUE</p><h2 className="section-title">Incomplete retailer-linked products</h2></div>
          <span className="badge warning">{incomplete.length} products</span>
        </div>
        {incomplete.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {incomplete.slice(0, 250).map((product) => (
              <article key={product.productId} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, padding: 14, border: "1px solid var(--line)", borderRadius: 14 }}>
                <div>
                  <Link href={`/products/${encodeURIComponent(product.productId)}`}><strong>{product.name}</strong></Link>
                  <p className="subtle" style={{ margin: "5px 0 0" }}>{product.retailers.join(" + ")}</p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                  {product.missing.map((field) => <span className="badge warning" key={field}>{label(field)}</span>)}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="subtle">All linked products currently meet the expected Australian label requirements.</p>}
      </section>
    </main>
  );
}
