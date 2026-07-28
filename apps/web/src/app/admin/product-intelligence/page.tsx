import Link from "next/link";
import { EnrichmentJobStatus, ProductLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import styles from "./product-intelligence-admin.module.css";

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

function label(value: string) {
  return value.replaceAll("_", " ");
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
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">ADMIN · PRODUCT INTELLIGENCE</p>
          <h1 className="page-title">Product Intelligence operations</h1>
          <p className="subtle">Inspect product lifecycle, confidence and enrichment activity.</p>
        </div>
        <Link className="secondary-button" href="/products">Open Product Library</Link>
      </header>

      <section className={styles.summaryGrid} aria-label="Product Intelligence summary">
        <article className="panel"><small>Products</small><h2>{totalProducts}</h2><p className="subtle">Canonical catalogue records</p></article>
        <article className="panel"><small>Knowledge records</small><h2>{totalKnowledge}</h2><p className="subtle">Reusable food knowledge</p></article>
        <article className="panel"><small>Active jobs</small><h2>{activeJobs}</h2><p className="subtle">Queued, running or retrying</p></article>
        <article className="panel"><small>Needs review</small><h2>{reviewProducts.length}</h2><p className="subtle">Low-confidence or flagged products</p></article>
      </section>

      <section className="panel">
        <p className="eyebrow">PRODUCT LIFECYCLE</p>
        <div className={styles.statusGrid}>
          {Object.values(ProductLifecycle).map((lifecycle) => (
            <div className={styles.statusCard} key={lifecycle}>
              <strong>{label(lifecycle)}</strong>
              <div className={styles.statusCount}>{lifecycleCounts.get(lifecycle) ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">ENRICHMENT QUEUE</p>
        <div className={styles.statusGrid}>
          {Object.values(EnrichmentJobStatus).map((status) => (
            <div className={styles.statusCard} key={status}>
              <strong>{label(status)}</strong>
              <div className={styles.statusCount}>{jobCounts.get(status) ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className={styles.sectionHeader}>
          <div><p className="eyebrow">RECENT JOBS</p><h2>Latest enrichment activity</h2></div>
          <small>{recentJobs.length} shown</small>
        </div>

        <table className={styles.desktopTable}>
          <thead><tr><th>Product</th><th>Provider</th><th>Status</th><th>Attempts</th><th>Created</th><th>Error</th></tr></thead>
          <tbody>
            {recentJobs.length ? recentJobs.map((job) => (
              <tr key={job.id}>
                <td><Link href={`/products/${encodeURIComponent(job.product.id)}`}>{job.product.name}</Link><br /><small>{label(job.product.lifecycle)} · {percent(job.product.confidenceScore)}</small></td>
                <td>{job.provider}</td><td>{label(job.status)}</td><td>{job.attempts}</td><td>{dateTime(job.createdAt)}</td><td>{job.lastError ?? "—"}</td>
              </tr>
            )) : <tr><td colSpan={6}>No enrichment jobs have been created yet.</td></tr>}
          </tbody>
        </table>

        <div className={styles.mobileList}>
          {recentJobs.length ? recentJobs.map((job) => (
            <article className={styles.mobileCard} key={job.id}>
              <div className={styles.mobileTitle}>
                <Link href={`/products/${encodeURIComponent(job.product.id)}`}>{job.product.name}</Link>
                <span className={styles.badge}>{label(job.status)}</span>
              </div>
              <div className={styles.mobileMeta}>
                <div><small>Provider</small><strong>{job.provider}</strong></div>
                <div><small>Confidence</small><strong>{percent(job.product.confidenceScore)}</strong></div>
                <div><small>Lifecycle</small><strong>{label(job.product.lifecycle)}</strong></div>
                <div><small>Attempts</small><strong>{job.attempts}</strong></div>
                <div><small>Created</small><strong>{dateTime(job.createdAt)}</strong></div>
                <div><small>Error</small><strong>{job.lastError ?? "None"}</strong></div>
              </div>
            </article>
          )) : <p className={styles.empty}>No enrichment jobs have been created yet.</p>}
        </div>
      </section>

      <section className="panel">
        <div className={styles.sectionHeader}><div><p className="eyebrow">REVIEW QUEUE</p><h2>Low-confidence products</h2></div></div>

        <table className={styles.desktopTable}>
          <thead><tr><th>Product</th><th>Type</th><th>Lifecycle</th><th>Confidence</th><th>Identity</th></tr></thead>
          <tbody>
            {reviewProducts.length ? reviewProducts.map((product) => (
              <tr key={product.id}>
                <td><Link href={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link></td>
                <td>{label(product.productType)}</td><td>{label(product.lifecycle)}</td><td>{percent(product.confidenceScore)}</td><td>{[product.brand, product.barcode].filter(Boolean).join(" · ") || "No brand or barcode"}</td>
              </tr>
            )) : <tr><td colSpan={5}>No products currently require review.</td></tr>}
          </tbody>
        </table>

        <div className={styles.mobileList}>
          {reviewProducts.length ? reviewProducts.map((product) => (
            <article className={styles.mobileCard} key={product.id}>
              <div className={styles.mobileTitle}>
                <Link href={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link>
                <span className={styles.badge}>{percent(product.confidenceScore)}</span>
              </div>
              <div className={styles.mobileMeta}>
                <div><small>Type</small><strong>{label(product.productType)}</strong></div>
                <div><small>Lifecycle</small><strong>{label(product.lifecycle)}</strong></div>
                <div><small>Identity</small><strong>{[product.brand, product.barcode].filter(Boolean).join(" · ") || "No brand or barcode"}</strong></div>
              </div>
            </article>
          )) : <p className={styles.empty}>No products currently require review.</p>}
        </div>
      </section>
    </main>
  );
}
