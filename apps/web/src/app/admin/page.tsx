import Link from "next/link";
import styles from "./admin.module.css";

export const metadata = {
  title: "Admin | Food",
};

const adminTools = [
  {
    title: "Catalogue Manager",
    description: "Review incomplete products, duplicate records, enrichment jobs and catalogue operations from one workspace.",
    href: "/admin/product-intelligence",
    icon: "◈",
    primary: true,
  },
  {
    title: "Australian Labels",
    description: "Audit and bulk-enrich Coles and Woolworths nutrition, serving, ingredient and allergen data.",
    href: "/admin/product-intelligence/labels",
    icon: "▤",
    primary: true,
  },
  {
    title: "Quality Dashboard",
    description: "Inspect catalogue confidence, validation failures and the records most in need of attention.",
    href: "/admin/product-intelligence/quality",
    icon: "✓",
    primary: false,
  },
  {
    title: "Provider Diagnostics",
    description: "Check retailer responses and identify parser, page, structured-data or connectivity failures.",
    href: "/admin/product-intelligence/diagnostics",
    icon: "⌁",
    primary: false,
  },
  {
    title: "Product Inspector",
    description: "Inspect canonical values, validation checks, retailer coverage and enrichment history for one product.",
    href: "/admin/product-intelligence/inspector",
    icon: "⌕",
    primary: false,
  },
] as const;

export default function AdminPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="eyebrow">OWNER ADMINISTRATION</p>
          <h1>Food control centre</h1>
          <p className={styles.intro}>
            Operate Australian Product Knowledge, review catalogue quality and diagnose retailer enrichment from one owner-only workspace.
          </p>
        </div>
        <div className={styles.ownerBadge}>
          <span>Access</span>
          <strong>Owner only</strong>
          <small>Protected server-side</small>
        </div>
      </section>

      <section>
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">PRODUCT KNOWLEDGE OPERATIONS</p>
            <h2>Administration tools</h2>
          </div>
          <p className="subtle">Five focused workspaces for catalogue maintenance and diagnostics.</p>
        </div>
      </section>

      <section className={styles.toolGrid} aria-label="Administration tools">
        {adminTools.map((tool) => (
          <article
            className={`${styles.toolCard} ${tool.primary ? styles.toolCardPrimary : ""}`}
            key={tool.href}
          >
            <div className={styles.cardTop}>
              <span aria-hidden="true" className={styles.iconWrap}>{tool.icon}</span>
              <span className={styles.status}>Available</span>
            </div>
            <div className={styles.toolContent}>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
            </div>
            <Link className={styles.toolLink} href={tool.href}>
              <span>Open workspace</span>
              <span aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </section>

      <footer className={styles.footerBar}>
        <p>Admin tools are hidden from standard accounts and protected from direct access.</p>
        <Link className={styles.backLink} href="/account"><span aria-hidden="true">←</span> Back to account</Link>
      </footer>
    </main>
  );
}
