import Link from "next/link";
import { getCatalogueHealthDetail } from "@/lib/product-intelligence/apke-admin.repository";
import styles from "./catalogue-health.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalogue Health | Food Admin" };

function pct(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

export default async function CatalogueHealthPage() {
  const health = await getCatalogueHealthDetail();
  const coverage = health.products ? (health.scored / health.products) * 100 : 0;
  const completeRate = health.products ? (health.complete / health.products) * 100 : 0;
  const goldRate = health.products ? (health.gold / health.products) * 100 : 0;

  const groups = [
    {
      title: "Catalogue",
      cards: [
        { label: "Products", value: health.products, note: `${health.scored} scored`, href: "/admin/product-intelligence/review-queue" },
        { label: "Average quality", value: pct(health.averageScore), note: `${pct(coverage)} catalogue coverage`, href: "/admin/product-intelligence/review-queue" },
        { label: "Complete", value: health.complete, note: `${pct(completeRate)} of catalogue`, href: "/admin/product-intelligence/review-queue" },
        { label: "Gold", value: health.gold, note: `${pct(goldRate)} at 98%+ with no gaps`, href: "/admin/product-intelligence/review-queue" },
      ],
    },
    {
      title: "Identity",
      cards: [
        { label: "Verified GTINs", value: health.verifiedGtins, note: "Authoritative identities", href: "/admin/product-intelligence/review-queue?filter=identity" },
        { label: "Provisional GTINs", value: health.provisionalGtins, note: "Awaiting verification", href: "/admin/product-intelligence/review-queue?filter=identity" },
        { label: "Missing GTIN", value: health.missingGtins, note: "Packaged products", href: "/admin/product-intelligence/review-queue?filter=identity" },
        { label: "Identity conflicts", value: health.identityConflicts, note: "Manual review required", href: "/admin/product-intelligence/review-queue?filter=review", critical: health.identityConflicts > 0 },
      ],
    },
    {
      title: "Australian label",
      cards: [
        { label: "Missing NIP", value: health.missingNip, note: "Energy or core nutrition absent", href: "/admin/product-intelligence/review-queue?filter=nutrition" },
        { label: "Missing serving size", value: health.missingServingSize, note: "No usable serve quantity", href: "/admin/product-intelligence/review-queue?filter=nutrition" },
        { label: "Missing servings per pack", value: health.missingServingsPerPackage, note: "Package count absent", href: "/admin/product-intelligence/review-queue?filter=nutrition" },
        { label: "Missing ingredients", value: health.missingIngredients, note: "Pack label text absent", href: "/admin/product-intelligence/review-queue?filter=label" },
        { label: "Missing allergens", value: health.missingAllergens, note: "Contains statement absent", href: "/admin/product-intelligence/review-queue?filter=label" },
      ],
    },
    {
      title: "Retail and media",
      cards: [
        { label: "Missing retailer links", value: health.missingRetailerLinks, note: "No active product URL", href: "/admin/product-intelligence/review-queue?filter=retail" },
        { label: "Missing images", value: health.missingImages, note: "No canonical image", href: "/admin/product-intelligence/review-queue?filter=image" },
        { label: "Open repairs", value: health.queuedRepairs, note: "Queued, running or review", href: "/admin/product-intelligence/review-queue?filter=queued" },
        { label: "Failed repairs", value: health.failedRepairs, note: "Requires diagnosis", href: "/admin/product-intelligence/review-queue?filter=failed", critical: health.failedRepairs > 0 },
      ],
    },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className="eyebrow">AUSTRALIAN PRODUCT KNOWLEDGE</p>
          <h1>Catalogue Health</h1>
          <p>Live APKE completeness, identity integrity, Australian label coverage and repair workload.</p>
        </div>
        <div className={styles.score}>
          <span>Average quality</span>
          <strong>{pct(health.averageScore)}</strong>
          <small>{health.scored.toLocaleString("en-AU")} products scored</small>
        </div>
      </header>

      <nav className={styles.actions}>
        <Link href="/admin">← Admin</Link>
        <Link href="/admin/product-intelligence/review-queue">Open review queue →</Link>
      </nav>

      {groups.map((group) => (
        <section className={styles.group} key={group.title}>
          <div className={styles.groupHeading}><h2>{group.title}</h2></div>
          <div className={styles.grid}>
            {group.cards.map((card) => (
              <Link className={`${styles.card} ${card.critical ? styles.critical : ""}`} href={card.href} key={card.label}>
                <span>{card.label}</span>
                <strong>{typeof card.value === "number" ? card.value.toLocaleString("en-AU") : card.value}</strong>
                <small>{card.note}</small>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
