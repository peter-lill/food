import Link from "next/link";
import { getAuthSession } from "@/lib/auth-session";
import { externalRecipes } from "@/lib/recipes/external-recipes";
import { formatLitres } from "@/lib/health/health.format";
import { isHealthConnectPaired } from "@/lib/health/health-pairing";
import { getLatestHealthSummary } from "@/lib/health/health.repository";
import { getPantryItems } from "@/lib/pantry/pantry.repository";

export const dynamic = "force-dynamic";

function randomRecipes(count: number) {
  const pool = externalRecipes.filter((recipe) => recipe.sourceName !== "Mayo Clinic");

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]];
  }

  return pool.slice(0, count);
}

export default async function Dashboard() {
  const session = await getAuthSession();
  const healthPaired = session
    ? await isHealthConnectPaired(session.user.id).catch(() => false)
    : false;
  const [health, pantryItems] = await Promise.all([
    session && healthPaired ? getLatestHealthSummary(session.user.id).catch(() => null) : Promise.resolve(null),
    getPantryItems().catch(() => []),
  ]);
  const attentionItems = pantryItems.filter((item) => item.expired || item.useSoon).slice(0, 4);
  const inspiration = randomRecipes(3);
  const tonight = inspiration[0];
  const firstName = session?.user.name?.trim().split(/\s+/)[0] || "there";

  return (
    <>
      <section className="v2-hero">
        <div className="v2-hero-copy">
          <p className="v2-kicker">YOUR KITCHEN, ORGANISED</p>
          <h1>Good evening, {firstName}.</h1>
          <p>Plan the week, use what you already have and make heart-conscious meals without turning dinner into admin.</p>
          <div className="v2-hero-actions">
            <Link className="v2-primary" href="/planner">Plan this week</Link>
            <Link className="v2-secondary" href="/recipes">Browse recipes</Link>
          </div>
        </div>
        {tonight ? (
          <aside className="v2-tonight">
            <small>TONIGHT&apos;S IDEA · {tonight.sourceName.toUpperCase()}</small>
            <strong>{tonight.name}</strong>
            <span>{tonight.tags.slice(0, 2).join(" · ")}</span>
            <a href={tonight.sourceUrl} rel="noopener noreferrer" target="_blank">Open recipe →</a>
          </aside>
        ) : null}
      </section>

      <section className="v2-stat-grid" aria-label="Today at a glance">
        {healthPaired ? (
          <>
            <article className="v2-stat"><div className="v2-stat-label"><span>Hydration</span><span className="v2-stat-icon">◌</span></div><div className="v2-stat-value">{health ? formatLitres(health.hydrationMl) : "—"}</div><div className="v2-stat-note">{health ? "of 3.0 L target" : "No health data synced"}</div></article>
            <article className="v2-stat"><div className="v2-stat-label"><span>Steps</span><span className="v2-stat-icon">↗</span></div><div className="v2-stat-value">{health ? Math.round(health.steps).toLocaleString("en-AU") : "—"}</div><div className="v2-stat-note">{health ? "of 10,000 target" : "No activity synced"}</div></article>
          </>
        ) : null}
        <article className="v2-stat"><div className="v2-stat-label"><span>Pantry</span><span className="v2-stat-icon">□</span></div><div className="v2-stat-value">{pantryItems.length}</div><div className="v2-stat-note">items currently stocked</div></article>
        <article className="v2-stat"><div className="v2-stat-label"><span>Use soon</span><span className="v2-stat-icon">!</span></div><div className="v2-stat-value">{attentionItems.length}</div><div className="v2-stat-note">items need attention</div></article>
      </section>

      <section className="v2-dashboard-grid">
        <article className="v2-panel">
          <div className="v2-panel-heading"><div><p className="eyebrow">QUICK INSPIRATION</p><h2>Recipe ideas</h2></div><Link href="/recipes">View all</Link></div>
          <div className="v2-recipe-list">
            {inspiration.map((recipe) => (
              <a className="v2-recipe" href={recipe.sourceUrl} key={recipe.id} rel="noopener noreferrer" target="_blank">
                <span>
                  <strong>{recipe.name}</strong>
                  <small>{recipe.sourceName} · {recipe.tags.slice(0, 2).join(" · ")}</small>
                </span>
                <span className="v2-recipe-arrow">→</span>
              </a>
            ))}
          </div>
        </article>

        <div>
          <article className="v2-panel">
            <div className="v2-panel-heading"><div><p className="eyebrow">PANTRY WATCH</p><h2>Use soon</h2></div><Link href="/pantry">Open Pantry</Link></div>
            {attentionItems.length ? <div className="v2-alerts">{attentionItems.map((item) => <div className="v2-alert" key={item.id}><span>{item.name}</span><span className={`badge ${item.expired ? "danger" : "warning"}`}>{item.expired ? "Expired" : `${item.quantity} ${item.unit}`}</span></div>)}</div> : <p className="v2-empty">Nothing needs attention. Your pantry is in good shape.</p>}
          </article>
          <article className="v2-panel" style={{ marginTop: 16 }}>
            <div className="v2-panel-heading"><div><p className="eyebrow">SHORTCUTS</p><h2>Get things done</h2></div></div>
            <div className="v2-quick-actions"><Link href="/scan">Scan product</Link><Link href="/shopping">Shopping list</Link><Link href="/planner">Weekly planner</Link><Link href="/receipts">Add receipt</Link></div>
          </article>
        </div>
      </section>
    </>
  );
}
