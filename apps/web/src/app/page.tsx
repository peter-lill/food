import Link from "next/link";
import { inventory, recipes } from "@/lib/demo";
import { getLatestHealthSummary } from "@/lib/health/health.repository";
import { formatLitres } from "@/lib/health/health.format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const health = await getLatestHealthSummary().catch(() => null);
  const hydrationTarget = 3000;
  const hydrationPercent = health
    ? Math.min(100, Math.round((health.hydrationMl / hydrationTarget) * 100))
    : 0;
  const stepTarget = 10000;
  const stepPercent = health
    ? Math.min(100, Math.round((health.steps / stepTarget) * 100))
    : 0;

  return <>
    <header className="topbar"><div><div className="brand">Food</div><div className="subtle">Good evening, Peter</div></div><span className="badge">Standalone v0.1.0</span></header>
    <div className="grid">
      <section className="card span-4"><div className="subtle">Hydration</div><div className="metric">{health ? formatLitres(health.hydrationMl) : "Not synced"}</div><div className="subtle">{health ? "of 3.0 L" : "Sync from Android"}</div><div className="progress"><span style={{width:`${hydrationPercent}%`}} /></div></section>
      <section className="card span-4"><div className="subtle">Steps</div><div className="metric">{health ? Math.round(health.steps).toLocaleString("en-AU") : "Not synced"}</div><div className="subtle">{health ? "of 10,000" : "Sync from Android"}</div><div className="progress"><span style={{width:`${stepPercent}%`}} /></div></section>
      <section className="card span-4"><div className="subtle">Health Connect</div><div className="metric">{health ? "Live" : "Waiting"}</div><div className="subtle">{health ? `Updated ${new Date(health.refreshedAt).toLocaleString("en-AU")}` : "No fabricated health values"}</div><Link className="button" href="/health" style={{marginTop:12}}>View health</Link></section>
      <section className="card span-8"><h2 className="section-title">Tonight</h2><div className="row"><div><strong>{recipes[1].name}</strong><div className="subtle">{recipes[1].protein} g protein · {recipes[1].minutes} minutes</div></div><Link className="button" href="/recipes">Cook</Link></div></section>
      <section className="card span-4"><h2 className="section-title">Use soon</h2><div className="list">{inventory.filter(i=>i.useSoon).map(i=><div className="row" key={i.name}><span>{i.name}</span><span className="badge">{i.quantity}</span></div>)}</div></section>
      <section className="card span-12"><h2 className="section-title">Ready from inventory</h2><div className="list">{recipes.map(r=><div className="row" key={r.name}><div><strong>{r.name}</strong><div className="subtle">{r.available}% ingredients available</div></div><span>{r.protein} g protein</span></div>)}</div></section>
    </div>
  </>;
}
