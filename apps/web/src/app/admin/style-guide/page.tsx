import Link from "next/link";
import {
  FoodBadge,
  FoodButton,
  FoodCard,
  FoodEmptyState,
  FoodField,
  FoodIconTile,
  FoodSectionHeader,
  FoodSkeleton,
} from "@/components/ui/FoodUI";

export const metadata = { title: "Style Guide | Food Admin" };

function LineIcon({ name }: { name: "drop" | "steps" | "pantry" | "heart" | "scan" }) {
  const paths = {
    drop: <path d="M12 3s5 5.3 5 10a5 5 0 0 1-10 0c0-4.7 5-10 5-10Z" />,
    steps: <><path d="M8 18c-2.5 0-4-1.2-4-3s1.5-3 4-3 4 1.2 4 3-1.5 3-4 3Z" /><path d="M16 11c-2.5 0-4-1.2-4-3s1.5-3 4-3 4 1.2 4 3-1.5 3-4 3Z" /></>,
    pantry: <><path d="M5 7h14v13H5z" /><path d="M4 4h16v3H4z" /><path d="M9 11h6" /></>,
    heart: <path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.8l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.4 1-1a5.5 5.5 0 0 0 0-7.8Z" />,
    scan: <><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" /><path d="M8 12h8" /></>,
  };
  return <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="22">{paths[name]}</svg>;
}

export default function StyleGuidePage() {
  return (
    <main style={{ display: "grid", gap: 32 }}>
      <FoodSectionHeader
        action={<FoodButton href="/admin" variant="secondary">Back to Admin</FoodButton>}
        description="The living source of truth for Food typography, colour, cards, controls, statuses and interaction patterns."
        eyebrow="OWNER ADMINISTRATION"
        title="Food v1 style guide"
      />

      <FoodCard tone="forest">
        <p className="food-eyebrow" style={{ color: "#d9f3df" }}>BRAND FOUNDATION</p>
        <h1 className="food-type-hero" style={{ margin: "10px 0 14px" }}>Know what’s in your kitchen.</h1>
        <p style={{ maxWidth: 720, margin: 0, color: "rgba(255,255,255,.78)", fontSize: 18, lineHeight: 1.55 }}>Food helps people plan, shop, cook and make better choices every day.</p>
        <div className="food-demo-row" style={{ marginTop: 24 }}>
          <FoodButton href="/" variant="secondary">Open Food</FoodButton>
          <FoodBadge tone="success">Food v1 foundation</FoodBadge>
        </div>
      </FoodCard>

      <section className="food-demo-stack">
        <FoodSectionHeader eyebrow="TOKENS" title="Colour palette" description="A restrained palette built around forest green, leaf green, coral, cream and functional accents." />
        <div className="food-token-grid">
          <div className="food-token" style={{ "--token": "#174a37", "--token-ink": "#fff" } as React.CSSProperties}><strong>Forest</strong><small>#174A37</small></div>
          <div className="food-token" style={{ "--token": "#2f7d5b", "--token-ink": "#fff" } as React.CSSProperties}><strong>Green</strong><small>#2F7D5B</small></div>
          <div className="food-token" style={{ "--token": "#7fa63a", "--token-ink": "#fff" } as React.CSSProperties}><strong>Leaf</strong><small>#7FA63A</small></div>
          <div className="food-token" style={{ "--token": "#f06a4f", "--token-ink": "#fff" } as React.CSSProperties}><strong>Coral</strong><small>#F06A4F</small></div>
          <div className="food-token" style={{ "--token": "#faf6ee" } as React.CSSProperties}><strong>Cream</strong><small>#FAF6EE</small></div>
        </div>
      </section>

      <section className="food-demo-stack">
        <FoodSectionHeader eyebrow="TYPE" title="Typography scale" />
        <FoodCard>
          <div className="food-demo-stack">
            <strong className="food-type-hero">Hero heading</strong>
            <strong className="food-type-page">Page heading</strong>
            <strong className="food-type-section">Section heading</strong>
            <strong className="food-type-card">Card heading</strong>
            <p className="subtle" style={{ margin: 0, maxWidth: 720 }}>Body copy remains readable, calm and direct. Supporting text should explain what the user can do next.</p>
          </div>
        </FoodCard>
      </section>

      <section className="food-demo-stack">
        <FoodSectionHeader eyebrow="COMPONENTS" title="Buttons, badges and icon tiles" />
        <div className="food-component-grid">
          <FoodCard className="food-demo-stack">
            <h3 className="food-type-card" style={{ margin: 0 }}>Buttons</h3>
            <div className="food-demo-row"><FoodButton href="#">Primary</FoodButton><FoodButton href="#" variant="secondary">Secondary</FoodButton><FoodButton href="#" variant="ghost">Ghost</FoodButton></div>
          </FoodCard>
          <FoodCard className="food-demo-stack">
            <h3 className="food-type-card" style={{ margin: 0 }}>Statuses</h3>
            <div className="food-demo-row"><FoodBadge>Neutral</FoodBadge><FoodBadge tone="success">Success</FoodBadge><FoodBadge tone="warning">Warning</FoodBadge><FoodBadge tone="danger">Error</FoodBadge><FoodBadge tone="coral">Health</FoodBadge></div>
          </FoodCard>
          <FoodCard className="food-demo-stack">
            <h3 className="food-type-card" style={{ margin: 0 }}>Icon tiles</h3>
            <div className="food-demo-row"><FoodIconTile tone="blue"><LineIcon name="drop" /></FoodIconTile><FoodIconTile tone="amber"><LineIcon name="steps" /></FoodIconTile><FoodIconTile><LineIcon name="pantry" /></FoodIconTile><FoodIconTile tone="coral"><LineIcon name="heart" /></FoodIconTile></div>
          </FoodCard>
        </div>
      </section>

      <section className="food-demo-stack">
        <FoodSectionHeader eyebrow="SURFACES" title="Cards and states" />
        <div className="food-component-grid">
          <FoodCard interactive className="food-demo-stack"><FoodIconTile><LineIcon name="pantry" /></FoodIconTile><h3 className="food-type-card" style={{ margin: 0 }}>Interactive summary card</h3><p className="subtle" style={{ margin: 0 }}>Cards lift gently and keep one clear purpose.</p></FoodCard>
          <FoodCard tone="soft" className="food-demo-stack"><FoodBadge tone="success">Pantry watch</FoodBadge><h3 className="food-type-card" style={{ margin: 0 }}>Soft information panel</h3><p className="subtle" style={{ margin: 0 }}>Use mint for reassuring or low-priority information.</p></FoodCard>
          <FoodCard className="food-demo-stack"><h3 className="food-type-card" style={{ margin: 0 }}>Loading state</h3><FoodSkeleton height={18} width="62%" /><FoodSkeleton height={12} /><FoodSkeleton height={12} width="82%" /></FoodCard>
        </div>
        <FoodEmptyState icon={<LineIcon name="scan" />} title="Nothing here yet" description="Empty states explain what happened and give the user a useful next step." action={<FoodButton href="/scan" size="small">Scan product</FoodButton>} />
      </section>

      <section className="food-demo-stack">
        <FoodSectionHeader eyebrow="FORMS" title="Inputs" description="All fields share the same focus treatment, spacing and supporting text." />
        <FoodCard>
          <div className="food-component-grid">
            <FoodField hint="Search product names, brands or barcodes." label="Search products" placeholder="Brown rice" />
            <FoodField hint="Use an Australian postcode." label="Home postcode" placeholder="4000" />
            <FoodField hint="Optional household label." label="Household name" placeholder="Home" />
          </div>
        </FoodCard>
      </section>

      <footer style={{ display: "flex", justifyContent: "space-between", gap: 16, paddingBottom: 20, color: "#718078", fontSize: 13 }}>
        <span>Owner-only living component library.</span>
        <Link href="/admin">Return to Food control centre →</Link>
      </footer>
    </main>
  );
}
