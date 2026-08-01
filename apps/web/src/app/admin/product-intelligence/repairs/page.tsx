import Link from "next/link";
import { RepairSimulation } from "../RepairSimulation";

export const dynamic = "force-dynamic";

export default function ProductIntelligenceRepairsPage() {
  return (
    <main style={{ display: "grid", gap: "1rem", padding: "clamp(1rem, 3vw, 2rem)", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow">ADMIN · PRODUCT INTELLIGENCE</p>
          <h1 className="page-title">Catalogue Repairs</h1>
          <p className="subtle">Versioned grocery identity analysis with explainable rename and merge recommendations.</p>
        </div>
        <Link className="secondary-button" href="/admin/product-intelligence">Back to Catalogue Manager</Link>
      </header>
      <RepairSimulation />
    </main>
  );
}
