import Link from "next/link";
import { getAuthSession } from "@/lib/auth-session";
import { externalRecipes, type ExternalRecipe } from "@/lib/recipes/external-recipes";
import { formatLitres } from "@/lib/health/health.format";
import { isHealthConnectPaired } from "@/lib/health/health-pairing";
import { getLatestHealthSummary } from "@/lib/health/health.repository";
import { getPantryItems } from "@/lib/pantry/pantry.repository";
import type { PantryQuantitySummary } from "@/lib/pantry/pantry.types";

export const dynamic = "force-dynamic";

const nonDinnerTerms = [
  "dessert", "sweet", "cake", "biscuit", "cookie", "muffin", "slice", "pudding",
  "smoothie", "drink", "beverage", "snack", "breakfast", "porridge", "granola", "pancake",
] as const;

function isDinnerRecipe(recipe: ExternalRecipe) {
  const text = [recipe.name, recipe.description, ...recipe.tags].join(" ").toLocaleLowerCase("en-AU");
  return !nonDinnerTerms.some((term) => text.includes(term));
}

function shuffledRecipes(recipes: ExternalRecipe[]) {
  const pool = [...recipes];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]];
  }
  return pool;
}

function recipeInspiration(count: number) {
  const available = externalRecipes.filter((recipe) => recipe.sourceName !== "Mayo Clinic");
  const dinners = shuffledRecipes(available.filter(isDinnerRecipe));
  const remaining = shuffledRecipes(available.filter((recipe) => !isDinnerRecipe(recipe)));
  return [...dinners, ...remaining].slice(0, count);
}

function brisbaneGreeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Australia/Brisbane",
  }).format(date));

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatPantryQuantities(quantities: PantryQuantitySummary[]) {
  return quantities.map(({ quantity, unit }) => {
    const amount = Number.isInteger(quantity)
      ? quantity.toLocaleString("en-AU")
      : quantity.toLocaleString("en-AU", { maximumFractionDigits: 2 });
    return `${amount} ${unit}`;
  }).join(" + ");
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
  const inspiration = recipeInspiration(4);
  const featuredRecipe = inspiration.find(isDinnerRecipe) ?? inspiration[0];
  const firstName = session?.user.name?.trim().split(/\s+/)[0] || "there";
  const greeting = brisbaneGreeting();

  return (
    <main className="food-home">
      <section className="food-home-editorial-hero">
        <div className="food-home-brand-block">
          <img alt="" aria-hidden="true" className="food-home-brand-mark" src="/brand/food-mark.svg" />
          <div>
            <p className="food-home-kicker">FOOD · YOUR KITCHEN COMPANION</p>
            <h1>{greeting}, {firstName}.</h1>
            <p>Know what you have, decide what to cook and make better choices today.</p>
          </div>
        </div>

        <div className="food-home-today-focus">
          <span className="food-home-focus-label">TODAY</span>
          <h2>{attentionItems.length ? `${attentionItems.length} pantry item${attentionItems.length === 1 ? "" : "s"} need attention.` : "Your kitchen is ready for the day."}</h2>
          <p>{attentionItems.length ? "Use what needs attention first, then plan a meal around what is already in your kitchen." : "Plan dinner, check your pantry or add anything you picked up today."}</p>
          <div className="food-home-hero-actions">
            <Link className="food-home-primary" href="/planner">Plan this week</Link>
            <Link className="food-home-secondary" href="/pantry">Open pantry</Link>
          </div>
        </div>

        {featuredRecipe ? (
          <aside className="food-home-featured-card">
            <div className="food-home-featured-art" aria-hidden="true">
              <span>Tonight</span>
              <b>Cook with what you have</b>
            </div>
            <div className="food-home-featured-copy">
              <small>{featuredRecipe.sourceName.toUpperCase()}</small>
              <strong>{featuredRecipe.name}</strong>
              <span>{featuredRecipe.tags.slice(0, 2).join(" · ")}</span>
              <a href={featuredRecipe.sourceUrl} rel="noopener noreferrer" target="_blank">Open recipe →</a>
            </div>
          </aside>
        ) : null}
      </section>

      <section className="food-home-stats" aria-label="Today at a glance">
        <Link href="/health" className="food-home-stat">
          <span><b>Hydration</b><i>◌</i></span>
          <strong>{healthPaired && health ? formatLitres(health.hydrationMl) : "—"}</strong>
          <small>{healthPaired ? "of 3.0 L target" : "Connect health data"}</small>
        </Link>
        <Link href="/health" className="food-home-stat">
          <span><b>Steps</b><i>↗</i></span>
          <strong>{healthPaired && health ? Math.round(health.steps).toLocaleString("en-AU") : "—"}</strong>
          <small>{healthPaired ? "of 10,000 target" : "Connect activity data"}</small>
        </Link>
        <Link href="/pantry" className="food-home-stat">
          <span><b>Pantry</b><i>□</i></span>
          <strong>{pantryItems.length.toLocaleString("en-AU")}</strong>
          <small>grocery items currently stocked</small>
        </Link>
        <Link href="/pantry" className="food-home-stat">
          <span><b>Use soon</b><i>!</i></span>
          <strong>{attentionItems.length.toLocaleString("en-AU")}</strong>
          <small>grocery items need attention</small>
        </Link>
      </section>

      <section className="food-home-content-grid">
        <article className="food-home-panel food-home-recipes-panel">
          <div className="food-home-panel-heading">
            <div><p>QUICK INSPIRATION</p><h2>Recipe ideas</h2></div>
            <Link href="/recipes">View all</Link>
          </div>
          <div className="food-home-recipe-list">
            {inspiration.slice(0, 3).map((recipe) => (
              <a href={recipe.sourceUrl} key={recipe.id} rel="noopener noreferrer" target="_blank">
                <span><strong>{recipe.name}</strong><small>{recipe.sourceName} · {recipe.tags.slice(0, 2).join(" · ")}</small></span>
                <b aria-hidden="true">→</b>
              </a>
            ))}
          </div>
        </article>

        <div className="food-home-side-stack">
          <article className="food-home-panel">
            <div className="food-home-panel-heading">
              <div><p>PANTRY WATCH</p><h2>Use soon</h2></div>
              <Link href="/pantry">Open Pantry</Link>
            </div>
            {attentionItems.length ? (
              <div className="food-home-alerts">
                {attentionItems.map((item) => (
                  <Link href="/pantry" key={item.key}>
                    <span>{item.canonicalName}</span>
                    <b>{item.expired ? "Expired" : formatPantryQuantities(item.quantities)}</b>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="food-home-empty"><span>✓</span><div><strong>Your pantry is in good shape.</strong><p>Nothing needs attention right now.</p></div></div>
            )}
          </article>

          <article className="food-home-panel">
            <div className="food-home-panel-heading"><div><p>SHORTCUTS</p><h2>Get things done</h2></div></div>
            <div className="food-home-shortcuts">
              <Link href="/scan">Scan product</Link>
              <Link href="/shopping">Shopping list</Link>
              <Link href="/planner">Weekly planner</Link>
              <Link href="/receipts">Add receipt</Link>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
