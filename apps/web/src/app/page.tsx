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
  "dessert", "sweet", "cake", "biscuit", "cookie", "muffin", "slice", "pudding", "yoghurt coated",
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
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Australia/Brisbane",
    }).format(date),
  );

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatPantryQuantities(quantities: PantryQuantitySummary[]) {
  return quantities
    .map(({ quantity, unit }) => {
      const amount = Number.isInteger(quantity)
        ? quantity.toLocaleString("en-AU")
        : quantity.toLocaleString("en-AU", { maximumFractionDigits: 2 });
      return `${amount} ${unit}`;
    })
    .join(" + ");
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
  const attentionItems = pantryItems.filter((item) => item.expired || item.useSoon).slice(0, 5);
  const inspiration = recipeInspiration(3);
  const firstName = session?.user.name?.trim().split(/\s+/)[0] || "there";
  const greeting = brisbaneGreeting();

  const summaryCards = [
    {
      label: "Pantry overview",
      value: pantryItems.length.toLocaleString("en-AU"),
      unit: "items",
      note: `${attentionItems.length} need attention`,
      href: "/pantry",
      icon: "▣",
    },
    {
      label: "Shopping list",
      value: "Open",
      unit: "list",
      note: "Plan the next shop",
      href: "/shopping",
      icon: "▤",
    },
    {
      label: "Recipes to cook",
      value: inspiration.length.toLocaleString("en-AU"),
      unit: "ideas",
      note: "Dinner-ready inspiration",
      href: "/recipes",
      icon: "◇",
    },
    {
      label: healthPaired ? "Health today" : "Health",
      value: healthPaired && health ? Math.round(health.steps).toLocaleString("en-AU") : "Connect",
      unit: healthPaired && health ? "steps" : "health",
      note: healthPaired && health ? `${formatLitres(health.hydrationMl)} hydration` : "Pair your health data",
      href: "/health",
      icon: "♡",
    },
  ];

  return (
    <main className="brand-dashboard">
      <header className="brand-dashboard-header">
        <div>
          <p className="eyebrow">YOUR KITCHEN TODAY</p>
          <h1>{greeting}, {firstName} <span aria-hidden="true">👋</span></h1>
          <p>Here&apos;s what&apos;s happening in your kitchen today.</p>
        </div>
        <div className="brand-dashboard-actions">
          <Link className="secondary-button" href="/scan">Scan product</Link>
          <Link className="primary-button" href="/planner">Plan this week</Link>
        </div>
      </header>

      <section className="brand-summary-grid" aria-label="Kitchen summary">
        {summaryCards.map((card) => (
          <Link className="brand-summary-card" href={card.href} key={card.label}>
            <span className="brand-summary-icon" aria-hidden="true">{card.icon}</span>
            <span className="brand-summary-label">{card.label}</span>
            <strong>{card.value} <small>{card.unit}</small></strong>
            <span className="brand-summary-note">{card.note}</span>
          </Link>
        ))}
      </section>

      <section className="brand-dashboard-grid">
        <article className="brand-panel brand-panel-wide">
          <div className="brand-panel-heading">
            <div><p className="eyebrow">PANTRY WATCH</p><h2>Use soon</h2></div>
            <Link href="/pantry">View all</Link>
          </div>
          {attentionItems.length ? (
            <div className="brand-attention-grid">
              {attentionItems.map((item) => (
                <Link className="brand-attention-item" href="/pantry" key={item.key}>
                  <span className="brand-food-placeholder" aria-hidden="true">◌</span>
                  <strong>{item.canonicalName}</strong>
                  <small>{item.expired ? "Expired" : formatPantryQuantities(item.quantities)}</small>
                </Link>
              ))}
            </div>
          ) : (
            <div className="brand-empty-state">
              <span aria-hidden="true">✓</span>
              <div><strong>Your pantry is in good shape.</strong><p>Nothing currently needs urgent attention.</p></div>
            </div>
          )}
        </article>

        <article className="brand-panel">
          <div className="brand-panel-heading">
            <div><p className="eyebrow">TONIGHT</p><h2>Recipe ideas</h2></div>
            <Link href="/recipes">View all</Link>
          </div>
          <div className="brand-recipe-list">
            {inspiration.map((recipe) => (
              <a href={recipe.sourceUrl} key={recipe.id} rel="noopener noreferrer" target="_blank">
                <span><strong>{recipe.name}</strong><small>{recipe.sourceName} · {recipe.tags.slice(0, 2).join(" · ")}</small></span>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </div>
        </article>
      </section>

      <section className="brand-shortcuts" aria-label="Shortcuts">
        <Link href="/scan"><span aria-hidden="true">⌗</span><strong>Scan product</strong><small>Add something quickly</small></Link>
        <Link href="/shopping"><span aria-hidden="true">✓</span><strong>Shopping list</strong><small>See what you need</small></Link>
        <Link href="/prices"><span aria-hidden="true">$</span><strong>Compare prices</strong><small>Find the best retailer</small></Link>
        <Link href="/receipts"><span aria-hidden="true">≡</span><strong>Add receipt</strong><small>Update pantry and spend</small></Link>
      </section>
    </main>
  );
}
