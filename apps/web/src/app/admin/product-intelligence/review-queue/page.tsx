import Link from "next/link";
import { getCatalogueReviewQueue, type ReviewFilter } from "@/lib/product-intelligence/apke-admin.repository";
import styles from "./review-queue.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Product Review Queue | Food Admin" };

type Props = { searchParams: Promise<{ filter?: string }> };

const filters: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "review", label: "Needs review" },
  { value: "queued", label: "Queued" },
  { value: "failed", label: "Failed" },
  { value: "identity", label: "Identity" },
  { value: "nutrition", label: "Nutrition" },
  { value: "label", label: "Ingredients & allergens" },
  { value: "retail", label: "Retail" },
  { value: "image", label: "Images" },
];

function humanise(value: string) {
  return value
    .replace(/^MISSING_/, "Missing ")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase("en-AU")
    .replace(/^\w/, (letter) => letter.toLocaleUpperCase("en-AU"));
}

function scoreClass(score: number | null) {
  if (score === null) return styles.scoreUnknown;
  if (score >= 95) return styles.scoreGood;
  if (score >= 75) return styles.scoreMedium;
  return styles.scoreLow;
}

export default async function ReviewQueuePage({ searchParams }: Props) {
  const params = await searchParams;
  const requested = params.filter as ReviewFilter | undefined;
  const filter = filters.some((item) => item.value === requested) ? requested! : "all";
  const items = await getCatalogueReviewQueue(filter);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className="eyebrow">AUSTRALIAN PRODUCT KNOWLEDGE</p>
          <h1>Product Review Queue</h1>
          <p>Prioritised identity conflicts, missing Australian label fields, retailer gaps and failed enrichment work.</p>
        </div>
        <div className={styles.total}><strong>{items.length}</strong><span>products shown</span></div>
      </header>

      <nav className={styles.topLinks}>
        <Link href="/admin/product-intelligence/catalogue-health">← Catalogue Health</Link>
        <Link href="/admin">Admin</Link>
      </nav>

      <nav className={styles.filters} aria-label="Review queue filters">
        {filters.map((item) => (
          <Link className={item.value === filter ? styles.activeFilter : ""} href={item.value === "all" ? "/admin/product-intelligence/review-queue" : `/admin/product-intelligence/review-queue?filter=${item.value}`} key={item.value}>
            {item.label}
          </Link>
        ))}
      </nav>

      {items.length ? (
        <section className={styles.queue}>
          {items.map((item) => {
            const reasons = [...new Set([...item.issues, ...item.repairReasons, ...item.missingFields.map((field) => `MISSING_${field}`)])];
            const productHref = item.slug ? `/products/${encodeURIComponent(item.slug)}` : `/products/${encodeURIComponent(item.productId)}`;
            return (
              <article className={styles.item} key={item.productId}>
                <div className={styles.identity}>
                  <div className={styles.identityTop}>
                    <div>
                      <p className="eyebrow">{item.gtinStatus ?? item.lifecycle}</p>
                      <h2>{item.name}</h2>
                      <p>{[item.brand, item.packSize, item.barcode ? `GTIN ${item.barcode}` : "GTIN missing"].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className={`${styles.score} ${scoreClass(item.overallScore)}`}>
                      <strong>{item.overallScore ?? "—"}</strong><span>quality</span>
                    </div>
                  </div>
                  <div className={styles.tags}>
                    {reasons.slice(0, 8).map((reason) => <span key={reason}>{humanise(reason)}</span>)}
                    {reasons.length > 8 ? <span>+{reasons.length - 8} more</span> : null}
                  </div>
                  {item.lastError ? <p className={styles.error}>{item.lastError}</p> : null}
                </div>

                <div className={styles.breakdown}>
                  <div><span>Identity</span><strong>{item.identityScore ?? "—"}</strong></div>
                  <div><span>Nutrition</span><strong>{item.nutritionScore ?? "—"}</strong></div>
                  <div><span>Label</span><strong>{item.labelScore ?? "—"}</strong></div>
                  <div><span>Retail</span><strong>{item.retailScore ?? "—"}</strong></div>
                  <div><span>Image</span><strong>{item.imageScore ?? "—"}</strong></div>
                </div>

                <div className={styles.itemActions}>
                  <Link href={`${productHref}`}>Open product</Link>
                  <Link href={`/admin/product-intelligence/inspector?productId=${encodeURIComponent(item.productId)}`}>Inspect record</Link>
                  <span className={styles.priority}>Priority {item.priority}</span>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className={styles.empty}>
          <strong>No products in this queue.</strong>
          <p>APKE has no records matching the selected filter.</p>
        </section>
      )}
    </main>
  );
}
