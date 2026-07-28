import Link from "next/link";
import { EnrichmentJobStatus, ProductLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dateTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function ProductIntelligenceAdminPage() {
  const [
    totalProducts,
    totalKnowledge,
    lifecycleGroups,
    jobGroups,
    recentJobs,
    reviewProducts,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.foodKnowledge.count(),
    prisma.product.groupBy({
      by: ["lifecycle"],
      _count: { _all: true },
      orderBy: { lifecycle: "asc" },
    }),
    prisma.productEnrichmentJob.groupBy({
      by: ["status"],
      _count: { _all: true },
      orderBy: { status: "asc" },
    }),
    prisma.productEnrichmentJob.findMany({
      include: {
        product: {
          select: { id: true, name: true, lifecycle: true, confidenceScore: true },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    }),
    prisma.product.findMany({
      where: {
        OR: [
          { lifecycle: ProductLifecycle.REVIEW_REQUIRED },
          { confidenceScore: { lt: 0.7 } },
        ],
      },
      select: {
        id: true,
        name: true,
        productType: true,
        lifecycle: true,
        confidenceScore: true,
        barcode: true,
        brand: true,
      },
      orderBy: [{ confidenceScore: "asc" }, { updatedAt: "desc" }],
      take: 30,
    }),
  ]);

  const lifecycleCounts = new Map(lifecycleGroups.map((group) => [group.lifecycle, group._count._all]));
  const jobCounts = new Map(jobGroups.map((group) => [group.status, group._count._all]));
  const activeJobs = (jobCounts.get(EnrichmentJobStatus.QUEUED) ?? 0)
    + (jobCounts.get(EnrichmentJobStatus.RUNNING) ?? 0)
    + (jobCounts.get(EnrichmentJobStatus.RETRY_SCHEDULED) ?? 0);

  return (
    <main style={{ display: "grid", gap: "1.5rem", padding: "1.5rem", maxWidth: 1400, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow">ADMIN · PRODUCT INTELLIGENCE</p>
          <h1 className="page-title">Product Intelligence operations</h1>
          <p className="subtle">Inspect product lifecycle, confidence and enrichment activity.</p>
        </div>
        <Link className="secondary-button" href="/products">Open Product Library</Link>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
        <article className="panel"><small>Products</small><h2>{totalProducts}</h2><p className="subtle">Canonical catalogue records</p></article>
        <article className="panel"><small>Knowledge records</small><h2>{totalKnowledge}</h2><p className="subtle">Reusable food knowledge</p></article>
        <article className="panel"><small>Active jobs</small><h2>{activeJobs}</h2><p className="subtle">Queued, running or retrying</p></article>
        <article className="panel"><small>Needs review</small><h2>{reviewProducts.length}</h2><p className="subtle">Low-confidence or flagged products</p></article>
      </section>

      <section className="panel">
        <p className="eyebrow">PRODUCT LIFECYCLE</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
          {Object.values(ProductLifecycle).map((lifecycle) => (
            <div key={lifecycle} style={{ border: "1px solid var(--border, #d9ded8)", borderRadius: 16, padding: "1rem" }}>
              <strong>{lifecycle.replaceAll("_", " ")}</strong>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.35rem" }}>{lifecycleCounts.get(lifecycle) ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">ENRICHMENT QUEUE</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
          {Object.values(EnrichmentJobStatus).map((status) => (
            <div key={status} style={{ border: "1px solid var(--border, #d9ded8)", borderRadius: 16, padding: "1rem" }}>
              <strong>{status.replaceAll("_", " ")}</strong>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.35rem" }}>{jobCounts.get(status) ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
          <div><p className="eyebrow">RECENT JOBS</p><h2>Latest enrichment activity</h2></div>
          <small>{recentJobs.length} shown</small>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem", minWidth: 800 }}>
          <thead><tr><th align="left">Product</th><th align="left">Provider</th><th align="left">Status</th><th align="right">Attempts</th><th align="left">Created</th><th align="left">Error</th></tr></thead>
          <tbody>
            {recentJobs.length ? recentJobs.map((job) => (
              <tr key={job.id} style={{ borderTop: "1px solid var(--border, #d9ded8)" }}>
                <td style={{ padding: "0.8rem 0" }}><Link href={`/products/${encodeURIComponent(job.product.id)}`}>{job.product.name}</Link><br /><small>{job.product.lifecycle} · {percent(job.product.confidenceScore)}</small></td>
                <td>{job.provider}</td><td>{job.status.replaceAll("_", " ")}</td><td align="right">{job.attempts}</td><td>{dateTime(job.createdAt)}</td><td>{job.lastError ?? "—"}</td>
              </tr>
            )) : <tr><td colSpan={6} style={{ padding: "1rem 0" }}>No enrichment jobs have been created yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="panel" style={{ overflowX: "auto" }}>
        <div><p className="eyebrow">REVIEW QUEUE</p><h2>Low-confidence products</h2></div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem", minWidth: 760 }}>
          <thead><tr><th align="left">Product</th><th align="left">Type</th><th align="left">Lifecycle</th><th align="right">Confidence</th><th align="left">Identity</th></tr></thead>
          <tbody>
            {reviewProducts.length ? reviewProducts.map((product) => (
              <tr key={product.id} style={{ borderTop: "1px solid var(--border, #d9ded8)" }}>
                <td style={{ padding: "0.8rem 0" }}><Link href={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link></td>
                <td>{product.productType.replaceAll("_", " ")}</td><td>{product.lifecycle.replaceAll("_", " ")}</td><td align="right">{percent(product.confidenceScore)}</td><td>{[product.brand, product.barcode].filter(Boolean).join(" · ") || "No brand or barcode"}</td>
              </tr>
            )) : <tr><td colSpan={5} style={{ padding: "1rem 0" }}>No products currently require review.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}
