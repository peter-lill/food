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

function HomeIcon({ name }: { name: "drop" | "steps" | "pantry" | "clock" | "spark" | "scan" | "cart" | "calendar" | "receipt" }) {
  const paths = {
    drop: <path d="M12 3s5 5.3 5 10a5 5 0 0 1-10 0c0-4.7 5-10 5-10Z" />,
    steps: <><path d="M7.5 18.5c-2.2 0-3.5-1.1-3.5-2.7 0-1.7 1.3-2.8 3.5-2.8S11 14.1 11 15.8c0 1.6-1.3 2.7-3.5 2.7Z" /><path d="M16.5 11c-2.2 0-3.5-1.1-3.5-2.7 0-1.7 1.3-2.8 3.5-2.8S20 6.6 20 8.3c0 1.6-1.3 2.7-3.5 2.7Z" /></>,
    pantry: <><path d="M5 7h14v13H5z" /><path d="M4 4h16v3H4z" /><path d="M9 11h6" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></>,
    spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></>,
    scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path d="M8 12h8" /></>,
    cart: <><path d="M3 5h2l2 10h9l2-7H6" /><circle cx="9" cy="19" r="1" /><circle cx="16" cy="19" r="1" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  };

  return <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="22">{paths[name]}</svg>;
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
  const expiredCount = pantryItems.filter((item) => item.expired).length;
  const inspiration = recipeInspiration(4);
  const featuredRecipe = inspiration.find(isDinnerRecipe) ?? inspiration[0];
  const firstName = session?.user.name?.trim().split(/\s+/)[0] || "there";
  const greeting = brisbaneGreeting();
  const pantryCount = pantryItems.length;

  const dailyMessage = attentionItems.length
    ? `${attentionItems.length} pantry item${attentionItems.length === 1 ? "" : "s"} should be used soon.`
    : pantryCount
      ? "Your pantry is organised and ready for today."
      : "Start building your kitchen knowledge today.";

  const highlights = [
    {
      tone: attentionItems.length ? "warning" : "success",
      title: attentionItems.length ? `${attentionItems.length} item${attentionItems.length === 1 ? "" : "s"} need attention` : "Pantry in good shape",
      detail: attentionItems.length ? "Use these first" : "Nothing urgent today",
    },
    {
      tone: "neutral",
      title: `${pantryCount} product${pantryCount === 1 ? "" : "s"} stocked`,
      detail: "Across your kitchen",
    },
    {
      tone: healthPaired && health ? "health" : "neutral",
      title: healthPaired && health ? `${formatLitres(health.hydrationMl)} hydration` : "Health data ready to connect",
      detail: healthPaired && health ? "Today so far" : "Add daily context",
    },
    {
      tone: expiredCount ? "danger" : "success",
      title: expiredCount ? `${expiredCount} expired item${expiredCount === 1 ? "" : "s"}` : "No expired items",
      detail: expiredCount ? "Review your pantry" : "Stock is current",
    },
  ] as const;

  return (
    <main className="home-v3">
      <section className="home-v3-hero">
        <div className="home-v3-intro">
          <img alt="" aria-hidden="true" className="home-v3-logo" src="/brand/food-basket.webp?v=20260824-1" />
          <p className="home-v3-eyebrow">YOUR KITCHEN, TODAY</p>
          <h1>{greeting},<br /><span>{firstName}.</span></h1>
          <p className="home-v3-lead">Know what is in your kitchen, cook with confidence and make healthier choices every day.</p>
          <div className="home-v3-actions">
            <Link className="home-v3-primary" href="/planner">Plan dinner</Link>
            <Link className="home-v3-secondary" href="/pantry">Open pantry</Link>
          </div>
        </div>

        <div className="home-v3-story">
          <div className="home-v3-today">
            <span className="home-v3-label">TODAY</span>
            <h2>{dailyMessage}</h2>
            <p>{attentionItems.length ? "Start with the items that need attention, then plan around what you already have." : "You can focus on planning dinner, checking prices or adding anything you picked up."}</p>
            <div className="home-v3-today-points">
              <span><b>✓</b>{pantryCount} products available</span>
              <span><b>✓</b>{expiredCount ? `${expiredCount} expired item${expiredCount === 1 ? "" : "s"} to review` : "Nothing expired"}</span>
            </div>
          </div>

          {featuredRecipe ? (
            <aside className="home-v3-tonight">
              <div className="home-v3-tonight-art">
                <span>TONIGHT</span>
                <strong>Cook with what you have</strong>
              </div>
              <div className="home-v3-tonight-copy">
                <small>{featuredRecipe.sourceName.toUpperCase()}</small>
                <h2>{featuredRecipe.name}</h2>
                <p>{featuredRecipe.tags.slice(0, 2).join(" · ") || "Dinner inspiration"}</p>
                <div className="home-v3-reasons">
                  <span>✓ Dinner-ready idea</span>
                  <span>✓ Built around your kitchen</span>
                </div>
                <a href={featuredRecipe.sourceUrl} rel="noopener noreferrer" target="_blank">Open recipe <span>→</span></a>
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      <section className="home-v3-highlights" aria-label="Today's highlights">
        <div className="home-v3-highlights-title"><HomeIcon name="spark" /><span>Today&apos;s highlights</span></div>
        <div className="home-v3-highlight-grid">
          {highlights.map((highlight) => (
            <div className={`home-v3-highlight home-v3-highlight-${highlight.tone}`} key={highlight.title}>
              <span className="home-v3-highlight-dot" />
              <div><strong>{highlight.title}</strong><small>{highlight.detail}</small></div>
            </div>
          ))}
        </div>
      </section>

      <section className="home-v3-main-grid">
        <article className="home-v3-panel home-v3-intelligence">
          <div className="home-v3-section-heading">
            <div><p>KITCHEN INTELLIGENCE</p><h2>What should you know?</h2></div>
            <Link href="/pantry">Open pantry</Link>
          </div>
          <div className="home-v3-intelligence-list">
            {attentionItems.length ? attentionItems.slice(0, 3).map((item) => (
              <Link href="/pantry" key={item.key}>
                <span className="home-v3-intelligence-icon"><HomeIcon name="clock" /></span>
                <span><strong>{item.canonicalName}</strong><small>{item.expired ? "Expired — review this item" : `${formatPantryQuantities(item.quantities)} available · use soon`}</small></span>
                <b>→</b>
              </Link>
            )) : (
              <div className="home-v3-intelligence-good">
                <span>✓</span>
                <div><strong>Your pantry is in good shape.</strong><p>Nothing needs urgent attention. This is a good day to plan from what you already have.</p></div>
              </div>
            )}
          </div>
        </article>

        <article className="home-v3-panel home-v3-recipes">
          <div className="home-v3-section-heading">
            <div><p>COOK FROM YOUR PANTRY</p><h2>Ideas for the next meal</h2></div>
            <Link href="/recipes">View all</Link>
          </div>
          <div className="home-v3-recipe-grid">
            {inspiration.slice(0, 3).map((recipe, index) => (
              <a href={recipe.sourceUrl} key={recipe.id} rel="noopener noreferrer" target="_blank">
                <span className={`home-v3-recipe-art home-v3-recipe-art-${index + 1}`} aria-hidden="true"><span>{index + 1}</span></span>
                <span className="home-v3-recipe-copy">
                  <small>{recipe.sourceName}</small>
                  <strong>{recipe.name}</strong>
                  <span>{recipe.tags.slice(0, 2).join(" · ") || "Meal inspiration"}</span>
                  <b>Why this? A practical idea for tonight.</b>
                </span>
                <i>→</i>
              </a>
            ))}
          </div>
        </article>
      </section>

      <section className="home-v3-metrics" aria-label="Supporting information">
        <Link href="/health" className="home-v3-metric home-v3-metric-blue">
          <span className="home-v3-metric-icon"><HomeIcon name="drop" /></span>
          <span><small>Hydration</small><strong>{healthPaired && health ? formatLitres(health.hydrationMl) : "—"}</strong><b>{healthPaired ? "of 3.0 L target" : "Connect health data"}</b></span>
        </Link>
        <Link href="/health" className="home-v3-metric home-v3-metric-amber">
          <span className="home-v3-metric-icon"><HomeIcon name="steps" /></span>
          <span><small>Steps</small><strong>{healthPaired && health ? Math.round(health.steps).toLocaleString("en-AU") : "—"}</strong><b>{healthPaired ? "of 10,000 target" : "Connect activity data"}</b></span>
        </Link>
        <Link href="/pantry" className="home-v3-metric home-v3-metric-green">
          <span className="home-v3-metric-icon"><HomeIcon name="pantry" /></span>
          <span><small>Pantry</small><strong>{pantryCount.toLocaleString("en-AU")}</strong><b>products currently stocked</b></span>
        </Link>
        <Link href="/pantry" className="home-v3-metric home-v3-metric-coral">
          <span className="home-v3-metric-icon"><HomeIcon name="clock" /></span>
          <span><small>Use soon</small><strong>{attentionItems.length.toLocaleString("en-AU")}</strong><b>products need attention</b></span>
        </Link>
      </section>

      <section className="home-v3-actions-panel">
        <div className="home-v3-section-heading">
          <div><p>QUICK ACTIONS</p><h2>What do you want to do next?</h2></div>
        </div>
        <div className="home-v3-action-grid">
          <Link href="/scan"><span><HomeIcon name="scan" /></span><div><strong>Scan product</strong><small>Add something quickly</small></div><b>→</b></Link>
          <Link href="/shopping"><span><HomeIcon name="cart" /></span><div><strong>Shopping list</strong><small>Plan the next shop</small></div><b>→</b></Link>
          <Link href="/planner"><span><HomeIcon name="calendar" /></span><div><strong>Weekly planner</strong><small>Organise your meals</small></div><b>→</b></Link>
          <Link href="/receipts"><span><HomeIcon name="receipt" /></span><div><strong>Add receipt</strong><small>Update pantry and spend</small></div><b>→</b></Link>
        </div>
      </section>
    </main>
  );
}
