import Link from "next/link";
import { inventory, recipes } from "@/lib/demo";

export default function Dashboard() {
  return <>
    <header className="topbar"><div><div className="brand">Food</div><div className="subtle">Good evening, Peter</div></div><span className="badge">Standalone v0.1.0</span></header>
    <div className="grid">
      <section className="card span-4"><div className="subtle">Hydration</div><div className="metric">2.35 L</div><div className="subtle">of 3.0 L</div><div className="progress"><span style={{width:"78%"}} /></div></section>
      <section className="card span-4"><div className="subtle">Steps</div><div className="metric">8,642</div><div className="subtle">of 10,000</div><div className="progress"><span style={{width:"86%"}} /></div></section>
      <section className="card span-4"><div className="subtle">Protein</div><div className="metric">154 g</div><div className="subtle">of 190 g</div><div className="progress"><span style={{width:"81%"}} /></div></section>
      <section className="card span-8"><h2 className="section-title">Tonight</h2><div className="row"><div><strong>{recipes[1].name}</strong><div className="subtle">{recipes[1].protein} g protein · {recipes[1].minutes} minutes</div></div><Link className="button" href="/recipes">Cook</Link></div></section>
      <section className="card span-4"><h2 className="section-title">Use soon</h2><div className="list">{inventory.filter(i=>i.useSoon).map(i=><div className="row" key={i.name}><span>{i.name}</span><span className="badge">{i.quantity}</span></div>)}</div></section>
      <section className="card span-12"><h2 className="section-title">Ready from inventory</h2><div className="list">{recipes.map(r=><div className="row" key={r.name}><div><strong>{r.name}</strong><div className="subtle">{r.available}% ingredients available</div></div><span>{r.protein} g protein</span></div>)}</div></section>
    </div>
  </>;
}
