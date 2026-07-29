import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { assessProductImage, type ProductImageAssessment } from "@/lib/products/image-quality";
import styles from "./image-intelligence.module.css";

export const dynamic = "force-dynamic";

type ImageView = "all" | "missing" | "broken" | "low-quality" | "healthy";
type PageProps = { searchParams: Promise<{ q?: string; view?: string }> };

type AuditedProduct = {
  id: string;
  slug: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  productType: string;
  imageUrl: string | null;
  assessment: ProductImageAssessment | null;
};

function normaliseView(value: string | undefined): ImageView {
  return ["missing", "broken", "low-quality", "healthy"].includes(value ?? "")
    ? value as ImageView
    : "all";
}

function absoluteImageUrl(value: string) {
  if (/^https:\/\//i.test(value)) return value;
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.BETTER_AUTH_URL
    ?? "https://food.coffeehq.coffee"
  ).replace(/\/$/, "");
  return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
}

function imageState(item: AuditedProduct): Exclude<ImageView, "all"> {
  if (!item.imageUrl) return "missing";
  if (!item.assessment?.reachable || !item.assessment.contentType?.startsWith("image/")) return "broken";
  if (item.assessment.score < 75 || item.assessment.issues.length > 0) return "low-quality";
  return "healthy";
}

function stateLabel(state: Exclude<ImageView, "all">) {
  if (state === "low-quality") return "Needs improvement";
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function dimensions(assessment: ProductImageAssessment | null) {
  return assessment?.width && assessment.height ? `${assessment.width} × ${assessment.height}` : "Not verified";
}

async function assessInBatches(products: Array<Omit<AuditedProduct, "assessment">>) {
  const audited: AuditedProduct[] = [];
  for (let index = 0; index < products.length; index += 6) {
    const batch = products.slice(index, index + 6);
    const results = await Promise.all(batch.map(async (product) => ({
      ...product,
      assessment: product.imageUrl
        ? await assessProductImage(absoluteImageUrl(product.imageUrl))
        : null,
    })));
    audited.push(...results);
  }
  return audited;
}

export default async function ImageIntelligencePage({ searchParams }: PageProps) {
  const { q = "", view: rawView } = await searchParams;
  const view = normaliseView(rawView);
  const search = q.trim();

  const products = await prisma.product.findMany({
    where: search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { canonicalName: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search } },
      ],
    } : undefined,
    select: {
      id: true,
      slug: true,
      name: true,
      brand: true,
      barcode: true,
      productType: true,
      imageUrl: true,
    },
    orderBy: [{ imageUrl: "asc" }, { updatedAt: "desc" }],
    take: 48,
  });

  const audited = await assessInBatches(products);
  const counts = {
    all: audited.length,
    missing: audited.filter((item) => imageState(item) === "missing").length,
    broken: audited.filter((item) => imageState(item) === "broken").length,
    "low-quality": audited.filter((item) => imageState(item) === "low-quality").length,
    healthy: audited.filter((item) => imageState(item) === "healthy").length,
  } satisfies Record<ImageView, number>;

  const visible = audited
    .filter((item) => view === "all" || imageState(item) === view)
    .sort((left, right) => {
      const leftScore = left.assessment?.score ?? -1;
      const rightScore = right.assessment?.score ?? -1;
      return leftScore - rightScore || left.name.localeCompare(right.name, "en-AU");
    });

  const views: Array<{ value: ImageView; label: string }> = [
    { value: "all", label: "Audited" },
    { value: "missing", label: "Missing" },
    { value: "broken", label: "Broken" },
    { value: "low-quality", label: "Needs improvement" },
    { value: "healthy", label: "Healthy" },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">ADMIN · IMAGE INTELLIGENCE</p>
          <h1 className="page-title">Image Intelligence</h1>
          <p className="subtle">Review image availability, resolution, shape and delivery quality without automatically removing usable images.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className="secondary-button" href="/admin/product-intelligence">Catalogue Manager</Link>
          <Link className="secondary-button" href="/products">Product Library</Link>
        </div>
      </header>

      <section className={styles.summaryGrid} aria-label="Image intelligence summary">
        <article className="panel"><small>Audited now</small><h2>{counts.all}</h2><p className="subtle">Maximum 48 per page load</p></article>
        <article className="panel"><small>Missing</small><h2>{counts.missing}</h2><p className="subtle">No selected image</p></article>
        <article className="panel"><small>Broken</small><h2>{counts.broken}</h2><p className="subtle">Unavailable or invalid response</p></article>
        <article className="panel"><small>Needs improvement</small><h2>{counts["low-quality"]}</h2><p className="subtle">Low resolution or poor proportions</p></article>
        <article className="panel"><small>Healthy</small><h2>{counts.healthy}</h2><p className="subtle">Valid and suitably sized</p></article>
      </section>

      <section className="panel">
        <div className={styles.toolbar}>
          <div><p className="eyebrow">LIVE AUDIT</p><h2>Product images</h2></div>
          <form className={styles.search}>
            {view !== "all" ? <input name="view" type="hidden" value={view} /> : null}
            <input aria-label="Search product images" defaultValue={q} name="q" placeholder="Search product, brand or barcode" type="search" />
            <button className="primary-button" type="submit">Audit</button>
          </form>
        </div>

        <nav className={styles.filters} aria-label="Image audit filters">
          {views.map((item) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (item.value !== "all") params.set("view", item.value);
            return (
              <Link className={view === item.value ? styles.filterActive : styles.filter} href={params.size ? `/admin/image-intelligence?${params}` : "/admin/image-intelligence"} key={item.value}>
                <span>{item.label}</span><strong>{counts[item.value]}</strong>
              </Link>
            );
          })}
        </nav>

        <div className={styles.grid}>
          {visible.length ? visible.map((item) => {
            const state = imageState(item);
            const href = `/products/${encodeURIComponent(item.slug ?? item.id)}`;
            return (
              <article className={styles.card} key={item.id}>
                <div className={styles.imageFrame}>
                  {item.imageUrl ? <img alt={item.name} loading="lazy" src={`/api/products/${encodeURIComponent(item.id)}/image`} /> : <div className={styles.missingImage}>No image</div>}
                  <span className={`${styles.state} ${styles[state]}`}>{stateLabel(state)}</span>
                </div>
                <div className={styles.body}>
                  <div className={styles.titleRow}><h3>{item.name}</h3><strong>{item.assessment?.score ?? 0}</strong></div>
                  <p>{[item.brand, item.barcode].filter(Boolean).join(" · ") || item.productType.replaceAll("_", " ").toLocaleLowerCase("en-AU")}</p>
                  <dl>
                    <div><dt>Dimensions</dt><dd>{dimensions(item.assessment)}</dd></div>
                    <div><dt>File size</dt><dd>{item.assessment?.contentLength ? `${Math.round(item.assessment.contentLength / 1024)} KB` : "Not verified"}</dd></div>
                  </dl>
                  <div className={styles.issues}>
                    {item.assessment?.issues.length ? item.assessment.issues.map((issue) => <span key={issue}>{issue}</span>) : <span>No technical issues detected</span>}
                  </div>
                  <Link className={styles.reviewLink} href={href}>Review and replace →</Link>
                </div>
              </article>
            );
          }) : <p className={styles.empty}>No product images match this filter.</p>}
        </div>
      </section>
    </main>
  );
}
