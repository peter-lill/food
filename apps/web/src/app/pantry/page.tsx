import Link from "next/link";
import { PantryManager } from "@/components/pantry/PantryManager";
import { getAuthSession } from "@/lib/auth-session";
import { getPantryItems } from "@/lib/pantry/pantry.repository";
import { getProductCatalogue } from "@/lib/products/product-catalogue.repository";
import { getShoppingListOptions } from "@/lib/shopping/shopping.repository";
import styles from "./pantry-hero.module.css";

export const dynamic = "force-dynamic";

async function loadPantryPageData() {
  try {
    const [items, products, shoppingLists, session] = await Promise.all([
      getPantryItems(),
      getProductCatalogue(),
      getShoppingListOptions(),
      getAuthSession(),
    ]);
    return { items, products, shoppingLists, session, loadError: false };
  } catch (error) {
    console.error("Unable to load pantry", error);
    return { items: [], products: [], shoppingLists: [], session: null, loadError: true };
  }
}

function greeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Australia/Brisbane",
  }).format(date));

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function PantryPage() {
  const { items, products, shoppingLists, session, loadError } = await loadPantryPageData();
  const firstName = session?.user.name?.trim().split(/\s+/)[0] || "there";
  const attentionCount = items.filter((item) => item.expired || item.useSoon).length;
  const expiredCount = items.filter((item) => item.expired).length;
  const locationCounts = {
    PANTRY: items.filter((item) => item.locations.includes("PANTRY")).length,
    FRIDGE: items.filter((item) => item.locations.includes("FRIDGE")).length,
    FREEZER: items.filter((item) => item.locations.includes("FREEZER")).length,
  };
  const locationMax = Math.max(1, ...Object.values(locationCounts));

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>YOUR KITCHEN, AT A GLANCE</p>
          <h1>Your Pantry</h1>
          <p>{greeting()}, {firstName}. See what you have, what needs attention and where everything is stored.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/scan">Scan product</Link>
            <Link className={styles.secondary} href="/receipts">Scan receipt</Link>
            <a className={styles.secondary} href="#pantry-manager">Add product</a>
          </div>
        </div>

        <aside className={styles.snapshot} aria-label="Pantry snapshot">
          <div className={styles.snapshotHeader}>
            <span>Pantry snapshot</span>
            <strong>{items.length} products</strong>
          </div>
          <div className={styles.metrics}>
            <div className={styles.metric}><strong>{items.length}</strong><span>Total products</span></div>
            <div className={styles.metric}><strong>{attentionCount}</strong><span>Need attention</span></div>
            <div className={styles.metric}><strong>{expiredCount}</strong><span>Expired</span></div>
            <div className={styles.metric}><strong>{Object.values(locationCounts).filter(Boolean).length}</strong><span>Storage areas</span></div>
          </div>
          <div className={styles.locations} aria-label="Storage locations">
            {Object.entries(locationCounts).map(([location, count]) => (
              <div className={styles.locationRow} key={location}>
                <span>{location.charAt(0) + location.slice(1).toLowerCase()}</span>
                <div className={styles.track}><span style={{ width: `${Math.max(count ? 10 : 0, (count / locationMax) * 100)}%` }} /></div>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <div className={styles.managerAnchor} id="pantry-manager">
        <PantryManager
          items={items}
          loadError={loadError}
          products={products}
          shoppingLists={shoppingLists}
        />
      </div>
    </main>
  );
}
