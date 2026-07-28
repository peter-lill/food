import Link from "next/link";
import { EnrichmentJobStatus, ProductLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { duplicateGroups, qualityIssues, qualityScore } from "@/lib/product-intelligence/catalogue-quality";
import { ConsolidateButton } from "./ConsolidateButton";
import styles from "./product-intelligence-admin.module.css";

export const dynamic = "force-dynamic";

function dateTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function ProductIntelligenceAdminPage() {
  const [totalKnowledge, lifecycleGroups, jobGroups, recentJobs, products] = await Promise.all([
    prisma.foodKnowledge.count(),
    prisma.product.groupBy({ by: ["lifecycle"], _count: { _all: true }, orderBy: { lifecycle: "asc" } }),
    prisma.productEnrichmentJob.groupBy({ by: ["status"], _count: { _all: true }, orderBy: { status: "asc" } }),
    prisma.productEnrichmentJob.findMany({
      include: { product: { select: { id: true, name: true, lifecycle: true, confidenceScore: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        canonicalName: true,
        brand: true,
        barcode: true,
        category: true,
        imageUrl: true,
        packSize: true,
        productType: true,
        lifecycle: true,
        confidenceScore: true,
        aliases: { select: { normalised: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
    }),
  ]);

  const lifecycleCounts = new Map(lifecycleGroups.map((group) => [group.lifecycle, group._count._all]));
  const jobCounts = new Map(jobGroups.map((group) => [group.status, group._count._all]));
  const activeJobs = (jobCounts.get(EnrichmentJobStatus.QUEUED) ?? 0)
    + (jobCounts.get(EnrichmentJobStatus.RUNNING) ?? 0)
    + (jobCounts.get(EnrichmentJobStatus.RETRY_SCHEDULED) ?? 0);

  const duplicates = duplicateGroups(products);
  const scoredProducts = products
    .map((product) => ({ product, score: qualityScore(product), issues: qualityIssues(product) }))
    .sort((left, right) => left.score - right.score || left.product.name.localeCompare(right.product.name));
  const issueCount = scoredProducts.reduce((total, item) => total + item.issues.length, 0);
  const catalogueHealth = products.length
    ? Math.round(scoredProducts.reduce((total, item) => total + item.score, 0) / products.length)
    : 100;
  const reviewProducts = scoredProducts.filter((item) => item.score < 80 || item.product.lifecycle === ProductLifecycle.REVIEW_REQUIRED).slice(0, 30);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">ADMIN · PRODUCT INTELLIGENCE</p>
          <h1 className="page-title">Product Intelligence operations</h1>
          <p className="subtle">Review catalogue quality, duplicate identities and enrichment activity.</p>
        </div>
        <Link className="secondary-button" href="/products">Open Product Library</Link>
      </header>

      <section className={styles.summaryGrid} aria-label="Product Intelligence summary">
        <article className="panel"><small>Catalogue health</small><h2>{catalogueHealth}%</h2><p className="subtle">Average product quality score</p></article>
        <article className="panel"><small>Products</small><h2>{products.length}</h2><p className="subtle">Canonical catalogue records</p></article>
        <article className="panel"><small>Issues</small><h2>{issueCount}</h2><p className="subtle">Quality findings requiring attention</p></article>
        <article className="panel"><small>Duplicate groups</small><h2>{duplicates.length}</h2><p className="subtle">Safe canonical merge candidates</p></article>
        <article className="panel"><small>Knowledge records</small><h2>{totalKnowledge}</h2><p className="subtle">Reusable food knowledge</p></article>
        <article className="panel"><small>Active jobs</small><h2>{activeJobs}</h2><p className="subtle">Queued, running or retrying</p></article>
      </section>

      <section className="panel">
        <div className={styles.sectionHeader}>
          <div><p className="eyebrow">CANONICAL MERGE ENGINE</p><h2>High-confidence duplicate groups</h2></div>
          <ConsolidateButton duplicateGroups={duplicates.length} />
        </div>
        <div className={styles.cardList}>
          {duplicates.length ? duplicates.map((group) => (
            <article className={styles.mobileCard} key={group.key}>
              <div className={styles.mobileTitle}><strong>{group.canonicalName}</strong><span className={styles.badge}>{group.products.length} records</span></div>
              <div className={styles.mobileMeta}>
                {group.products.map((product) => (
                  <div key={product.id}><small>Current record</small><strong>{product.name}</strong></div>
                ))}
              </div>
            </article>
          )) : <p className={styles.empty}>No duplicate canonical identities detected.</p>}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">PRODUCT LIFECYCLE</p>
        <div className={styles.statusGrid}>
          {Object.values(ProductLifecycle).map((lifecycle) => (
            <div className={styles.statusCard} key={lifecycle}><strong>{label(lifecycle)}</strong><div className={styles.statusCount}>{lifecycleCounts.get(lifecycle) ?? 0}</div></div>
          ))}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">ENRICHMENT QUEUE</p>
        <div className={styles.statusGrid}>
          {Object.values(EnrichmentJobStatus).map((status) => (
            <div className={styles.statusCard} key={status}><strong>{label(status)}</strong><div className={styles.statusCount}>{jobCounts.get(status) ?? 0}</div></div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className={styles.sectionHeader}><div><p className="eyebrow">REVIEW QUEUE</p><h2>Lowest-quality products</h2></div><small>{reviewProducts.length} shown</small></div>
        <div className={styles.cardList}>
          {reviewProducts.length ? reviewProducts.map(({ product, score, issues }) => (
            <article className={styles.mobileCard} key={product.id}>
              <div className={styles.mobileTitle}><Link href={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link><span className={styles.badge}>{score}%</span></div>
              <div className={styles.mobileMeta}>
                <div><small>Canonical name</small><strong>{product.canonicalName ?? "Not set"}</strong></div>
                <div><small>Type</small><strong>{label(product.productType)}</strong></div>
                <div><small>Lifecycle</small><strong>{label(product.lifecycle)}</strong></div>
                <div><small>Issues</small><strong>{issues.map((issue) => label(issue.code)).join(" · ") || "None"}</strong></div>
              </div>
            </article>
          )) : <p className={styles.empty}>No products currently require review.</p>}
        </div>
      </section>

      <section className="panel">
        <div className={styles.sectionHeader}><div><p className="eyebrow">RECENT JOBS</p><h2>Latest enrichment activity</h2></div><small>{recentJobs.length} shown</small></div>
        <div className={styles.cardList}>
          {recentJobs.length ? recentJobs.map((job) => (
            <article className={styles.mobileCard} key={job.id}>
              <div className={styles.mobileTitle}><Link href={`/products/${encodeURIComponent(job.product.id)}`}>{job.product.name}</Link><span className={styles.badge}>{label(job.status)}</span></div>
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
    </main>
  );
}
