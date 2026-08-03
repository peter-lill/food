import Link from "next/link";
import { EnrichmentJobStatus, ProductLifecycle, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { duplicateGroups, qualityIssues, qualityScore } from "@/lib/product-intelligence/catalogue-quality";
import { ConsolidateButton } from "./ConsolidateButton";
import styles from "./product-intelligence-admin.module.css";

export const dynamic = "force-dynamic";

type ReviewView = "all" | "review" | "missing-image" | "missing-barcode" | "missing-department" | "duplicates";
type PageProps = { searchParams: Promise<{ q?: string; view?: string }> };

function dateTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function label(value: string) {
  return value.replaceAll("_", " ").toLocaleLowerCase("en-AU").replace(/(^|\s)([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

function normaliseView(value: string | undefined): ReviewView {
  return ["review", "missing-image", "missing-barcode", "missing-department", "duplicates"].includes(value ?? "")
    ? value as ReviewView
    : "all";
}

export default async function ProductIntelligenceAdminPage({ searchParams }: PageProps) {
  const { q = "", view: rawView } = await searchParams;
  const view = normaliseView(rawView);
  const search = q.trim().toLocaleLowerCase("en-AU");

  const [totalKnowledge, lifecycleGroups, jobGroups, recentJobs, products] = await Promise.all([
    prisma.foodKnowledge.count(),
    prisma.product.groupBy({ by: ["lifecycle"], _count: { _all: true }, orderBy: { lifecycle: "asc" } }),
    prisma.productEnrichmentJob.groupBy({ by: ["status"], _count: { _all: true }, orderBy: { status: "asc" } }),
    prisma.productEnrichmentJob.findMany({
      include: { product: { select: { id: true, slug: true, name: true, lifecycle: true, confidenceScore: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
    }),
    prisma.product.findMany({
      select: {
        id: true,
        slug: true,
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
        storeProducts: { select: { imageUrl: true, retailer: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 1000,
    }),
  ]);

  const lifecycleCounts = new Map(lifecycleGroups.map((group) => [group.lifecycle, group._count._all]));
  const jobCounts = new Map(jobGroups.map((group) => [group.status, group._count._all]));
  const activeJobs = (jobCounts.get(EnrichmentJobStatus.QUEUED) ?? 0)
    + (jobCounts.get(EnrichmentJobStatus.RUNNING) ?? 0)
    + (jobCounts.get(EnrichmentJobStatus.RETRY_SCHEDULED) ?? 0);

  const enrichedProducts = products.map((product) => {
    const hasImage = Boolean(product.imageUrl || product.storeProducts.some((listing) => listing.imageUrl));
    const issues = qualityIssues(product);
    return {
      product,
      hasImage,
      score: qualityScore(product),
      issues,
      missingBarcode: product.productType !== ProductType.GENERIC_PRODUCE && !product.barcode,
      missingDepartment: !product.category || product.category === "Other",
      requiresReview: product.lifecycle === ProductLifecycle.REVIEW_REQUIRED || qualityScore(product) < 80,
    };
  });

  const duplicates = duplicateGroups(products);
  const duplicateIds = new Set(duplicates.flatMap((group) => group.products.map((product) => product.id)));
  const issueCount = enrichedProducts.reduce((total, item) => total + item.issues.length, 0);
  const catalogueHealth = products.length
    ? Math.round(enrichedProducts.reduce((total, item) => total + item.score, 0) / products.length)
    : 100;

  const counts: Record<ReviewView, number> = {
    all: products.length,
    review: enrichedProducts.filter((item) => item.requiresReview).length,
    "missing-image": enrichedProducts.filter((item) => !item.hasImage).length,
    "missing-barcode": enrichedProducts.filter((item) => item.missingBarcode).length,
    "missing-department": enrichedProducts.filter((item) => item.missingDepartment).length,
    duplicates: duplicateIds.size,
  };

  const reviewProducts = enrichedProducts
    .filter((item) => {
      if (search) {
        const haystack = [item.product.name, item.product.canonicalName, item.product.brand, item.product.barcode, item.product.category]
          .filter(Boolean).join(" ").toLocaleLowerCase("en-AU");
        if (!haystack.includes(search)) return false;
      }
      if (view === "review") return item.requiresReview;
      if (view === "missing-image") return !item.hasImage;
      if (view === "missing-barcode") return item.missingBarcode;
      if (view === "missing-department") return item.missingDepartment;
      if (view === "duplicates") return duplicateIds.has(item.product.id);
      return true;
    })
    .sort((left, right) => left.score - right.score || left.product.name.localeCompare(right.product.name, "en-AU"))
    .slice(0, 100);

  const views: Array<{ value: ReviewView; label: string }> = [
    { value: "all", label: "All products" },
    { value: "review", label: "Needs review" },
    { value: "missing-image", label: "Missing image" },
    { value: "missing-barcode", label: "Missing barcode" },
    { value: "missing-department", label: "Missing department" },
    { value: "duplicates", label: "Possible duplicates" },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">ADMIN · CATALOGUE MANAGER</p>
          <h1 className="page-title">Catalogue Manager</h1>
          <p className="subtle">Find incomplete records, repair product identity and consolidate duplicates.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="secondary-button" href="/admin/product-intelligence/quality">Quality dashboard</Link>
          <Link className="secondary-button" href="/admin/product-intelligence/labels">Australian labels</Link>
          <Link className="secondary-button" href="/products">Open Product Library</Link>
        </div>
      </header>

      <section className={styles.summaryGrid} aria-label="Catalogue summary">
        <article className="panel"><small>Catalogue health</small><h2>{catalogueHealth}%</h2><p className="subtle">Average product quality</p></article>
        <article className="panel"><small>Products</small><h2>{products.length}</h2><p className="subtle">Catalogue records</p></article>
        <article className="panel"><small>Needs review</small><h2>{counts.review}</h2><p className="subtle">Low-confidence or flagged records</p></article>
        <article className="panel"><small>Missing images</small><h2>{counts["missing-image"]}</h2><p className="subtle">No usable product image</p></article>
        <article className="panel"><small>Missing barcodes</small><h2>{counts["missing-barcode"]}</h2><p className="subtle">Packaged products only</p></article>
        <article className="panel"><small>Duplicate records</small><h2>{counts.duplicates}</h2><p className="subtle">Across {duplicates.length} groups</p></article>
      </section>

      <section className="panel">
        <div className={styles.sectionHeader}>
          <div><p className="eyebrow">REVIEW WORKSPACE</p><h2>Products requiring attention</h2></div>
          <small>{reviewProducts.length} shown · {issueCount} total findings</small>
        </div>

        <form className={styles.searchBar}>
          {view !== "all" ? <input name="view" type="hidden" value={view} /> : null}
          <input aria-label="Search catalogue" defaultValue={q} name="q" placeholder="Search product, brand, barcode or department" type="search" />
          <button className="primary-button" type="submit">Search</button>
        </form>

        <nav className={styles.filters} aria-label="Catalogue review filters">
          {views.map((item) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (item.value !== "all") params.set("view", item.value);
            return <Link className={view === item.value ? styles.filterActive : styles.filter} href={params.size ? `/admin/product-intelligence?${params}` : "/admin/product-intelligence"} key={item.value}><span>{item.label}</span><strong>{counts[item.value]}</strong></Link>;
          })}
        </nav>

        <div className={styles.cardList}>
          {reviewProducts.length ? reviewProducts.map(({ product, score, issues, hasImage, missingBarcode, missingDepartment }) => {
            const href = `/products/${encodeURIComponent(product.slug ?? product.id)}`;
            const findings = [...new Set([
              !hasImage ? "Image missing" : null,
              missingBarcode ? "Barcode missing" : null,
              missingDepartment ? "Department missing" : null,
              ...issues.map((issue) => label(issue.code)),
            ].filter((item): item is string => Boolean(item)))];
            return (
              <article className={styles.mobileCard} key={product.id}>
                <div className={styles.mobileTitle}><Link href={href}>{product.name}</Link><span className={styles.badge}>{score}%</span></div>
                <div className={styles.mobileMeta}>
                  <div><small>Family</small><strong>{product.canonicalName ?? "Not set"}</strong></div>
                  <div><small>Department</small><strong>{product.category ?? "Not set"}</strong></div>
                  <div><small>Product type</small><strong>{label(product.productType)}</strong></div>
                  <div><small>Barcode</small><strong>{product.productType === ProductType.GENERIC_PRODUCE ? "Not required" : product.barcode ?? "Missing"}</strong></div>
                </div>
                <p className={styles.findings}>{findings.length ? findings.join(" · ") : "No outstanding findings"}</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link className={styles.reviewLink} href={href}>Review product →</Link>
                  <Link className={styles.reviewLink} href={`/admin/product-intelligence/inspector?productId=${encodeURIComponent(product.id)}`}>Inspect knowledge →</Link>
                </div>
              </article>
            );
          }) : <p className={styles.empty}>No products match this review queue.</p>}
        </div>
      </section>

      <section className="panel">
        <div className={styles.sectionHeader}>
          <div><p className="eyebrow">MERGE WORKSPACE</p><h2>High-confidence duplicate groups</h2></div>
          <ConsolidateButton duplicateGroups={duplicates.length} />
        </div>
        <div className={styles.cardList}>
          {duplicates.length ? duplicates.slice(0, 30).map((group) => (
            <article className={styles.mobileCard} key={group.key}>
              <div className={styles.mobileTitle}><strong>{group.canonicalName}</strong><span className={styles.badge}>{group.products.length} records</span></div>
              <div className={styles.duplicateLinks}>{group.products.map((product) => <Link href={`/products/${encodeURIComponent(product.id)}`} key={product.id}>{product.name}</Link>)}</div>
              <p className={styles.findings}>Open the duplicate record you do not want to keep, then use its Merge product panel to select the survivor.</p>
            </article>
          )) : <p className={styles.empty}>No duplicate canonical identities detected.</p>}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">OPERATIONS</p>
        <div className={styles.statusGrid}>
          <div className={styles.statusCard}><strong>Knowledge records</strong><div className={styles.statusCount}>{totalKnowledge}</div></div>
          <div className={styles.statusCard}><strong>Active jobs</strong><div className={styles.statusCount}>{activeJobs}</div></div>
          {Object.values(ProductLifecycle).map((lifecycle) => <div className={styles.statusCard} key={lifecycle}><strong>{label(lifecycle)}</strong><div className={styles.statusCount}>{lifecycleCounts.get(lifecycle) ?? 0}</div></div>)}
        </div>
      </section>

      <section className="panel">
        <div className={styles.sectionHeader}><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Latest enrichment jobs</h2></div><small>{recentJobs.length} shown</small></div>
        <div className={styles.cardList}>
          {recentJobs.length ? recentJobs.map((job) => (
            <article className={styles.mobileCard} key={job.id}>
              <div className={styles.mobileTitle}><Link href={`/products/${encodeURIComponent(job.product.slug ?? job.product.id)}`}>{job.product.name}</Link><span className={styles.badge}>{label(job.status)}</span></div>
              <div className={styles.mobileMeta}>
                <div><small>Provider</small><strong>{job.provider}</strong></div>
                <div><small>Confidence</small><strong>{percent(job.product.confidenceScore)}</strong></div>
                <div><small>Created</small><strong>{dateTime(job.createdAt)}</strong></div>
                <div><small>Attempts</small><strong>{job.attempts}</strong></div>
              </div>
              {job.lastError ? <p className={styles.findings}>{job.lastError}</p> : null}
            </article>
          )) : <p className={styles.empty}>No enrichment jobs have been created yet.</p>}
        </div>
      </section>
    </main>
  );
}
