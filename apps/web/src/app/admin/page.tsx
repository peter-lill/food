import Link from "next/link";

export const metadata = {
  title: "Admin | Food",
};

const adminTools = [
  {
    title: "Catalogue Manager",
    description: "Review incomplete products, duplicate records and recent enrichment activity.",
    href: "/admin/product-intelligence",
    icon: "◈",
  },
  {
    title: "Australian Labels",
    description: "Audit and bulk-enrich Coles and Woolworths nutrition, serving and ingredient data.",
    href: "/admin/product-intelligence/labels",
    icon: "▤",
  },
  {
    title: "Quality Dashboard",
    description: "Inspect catalogue confidence, validation failures and the weakest product records.",
    href: "/admin/product-intelligence/quality",
    icon: "✓",
  },
  {
    title: "Provider Diagnostics",
    description: "Check retailer responses and identify parser, page or connectivity failures.",
    href: "/admin/product-intelligence/diagnostics",
    icon: "⌁",
  },
  {
    title: "Product Inspector",
    description: "Inspect canonical values, validation checks, retailers and enrichment history for one product.",
    href: "/admin/product-intelligence/inspector",
    icon: "⌕",
  },
] as const;

export default function AdminPage() {
  return (
    <main style={{ display: "grid", gap: 20 }}>
      <header className="page-header">
        <div>
          <p className="eyebrow">OWNER ADMINISTRATION</p>
          <h1 className="page-title">Food Admin</h1>
          <p className="subtle">Manage Australian Product Knowledge, catalogue quality and provider operations.</p>
        </div>
        <Link className="secondary-button" href="/account">Back to account</Link>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {adminTools.map((tool) => (
          <article className="card" key={tool.href} style={{ display: "grid", gap: 14 }}>
            <span aria-hidden="true" style={{ fontSize: 28 }}>{tool.icon}</span>
            <div>
              <h2 style={{ margin: 0 }}>{tool.title}</h2>
              <p className="subtle">{tool.description}</p>
            </div>
            <Link className="primary-button" href={tool.href}>Open {tool.title}</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
