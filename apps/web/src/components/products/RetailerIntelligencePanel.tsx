import Link from "next/link";
import { prisma } from "@/lib/prisma";
import styles from "./RetailerIntelligencePanel.module.css";

type RetailerIntelligencePanelProps = {
  productIdOrSlug: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function date(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(value)
    : "Not checked";
}

function retailerMark(retailer: string) {
  if (retailer.toLocaleLowerCase("en-AU").includes("coles")) return "C";
  if (retailer.toLocaleLowerCase("en-AU").includes("woolworths")) return "W";
  return retailer.slice(0, 1).toLocaleUpperCase("en-AU") || "R";
}

export async function RetailerIntelligencePanel({
  productIdOrSlug,
}: RetailerIntelligencePanelProps) {
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id: productIdOrSlug }, { slug: productIdOrSlug }],
    },
    select: {
      id: true,
      storeProducts: {
        where: { active: true },
        orderBy: [{ retailer: "asc" }, { lastSeenAt: "desc" }],
        select: {
          id: true,
          retailer: true,
          retailerProductName: true,
          packSize: true,
          productUrl: true,
          lastSeenAt: true,
        },
      },
      priceObservations: {
        orderBy: { observedAt: "desc" },
        take: 100,
        select: {
          id: true,
          retailer: true,
          price: true,
          unitPrice: true,
          unitLabel: true,
          isSpecial: true,
          observedAt: true,
        },
      },
    },
  });

  if (!product) return null;

  const latestByRetailer = new Map<string, (typeof product.priceObservations)[number]>();
  for (const observation of product.priceObservations) {
    if (!latestByRetailer.has(observation.retailer)) {
      latestByRetailer.set(observation.retailer, observation);
    }
  }

  const listings = product.storeProducts
    .map((listing) => ({
      listing,
      latest: latestByRetailer.get(listing.retailer) ?? null,
    }))
    .sort((left, right) => {
      if (left.listing.retailer === "Coles" && right.listing.retailer !== "Coles") return -1;
      if (right.listing.retailer === "Coles" && left.listing.retailer !== "Coles") return 1;
      const leftPrice = left.latest?.price ?? Number.POSITIVE_INFINITY;
      const rightPrice = right.latest?.price ?? Number.POSITIVE_INFINITY;
      return leftPrice - rightPrice;
    });

  const prices = product.priceObservations.map((observation) => observation.price);
  const lowest = prices.length ? Math.min(...prices) : null;
  const highest = prices.length ? Math.max(...prices) : null;
  const average = prices.length
    ? prices.reduce((total, value) => total + value, 0) / prices.length
    : null;

  if (!listings.length && !prices.length) return null;

  return (
    <section className={styles.panel} aria-labelledby="retailer-intelligence-heading">
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">RETAILER INTELLIGENCE</p>
          <h2 id="retailer-intelligence-heading">Current prices</h2>
        </div>
        <p>Coles is prioritised when an equally reliable match is available.</p>
      </div>

      {listings.length ? (
        <div className={styles.cards}>
          {listings.map(({ listing, latest }) => (
            <article
              className={`${styles.card} ${latest?.isSpecial ? styles.cardSpecial : ""}`}
              key={listing.id}
            >
              <div className={styles.cardHead}>
                <div className={styles.retailer}>
                  <span className={styles.mark} aria-hidden="true">
                    {retailerMark(listing.retailer)}
                  </span>
                  <div>
                    <strong>{listing.retailer}</strong>
                    <small>{listing.retailerProductName}</small>
                  </div>
                </div>
                <span className={latest?.isSpecial ? styles.special : styles.status}>
                  {latest?.isSpecial ? "On special" : latest ? "Regular" : "Price pending"}
                </span>
              </div>

              <div className={styles.priceRow}>
                <strong className={styles.price}>{latest ? money(latest.price) : "—"}</strong>
                <span className={styles.pack}>
                  {latest?.unitPrice ? `${money(latest.unitPrice)} ${latest.unitLabel ?? "unit"}` : listing.packSize ?? "Pack size not known"}
                </span>
              </div>

              <div className={styles.cardFoot}>
                <span>Checked {date(latest?.observedAt ?? listing.lastSeenAt)}</span>
                {listing.productUrl ? (
                  <Link className={styles.link} href={listing.productUrl} target="_blank" rel="noreferrer">
                    Open product ↗
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Retailer identity is known, but no current listing is available yet.</p>
      )}

      {prices.length ? (
        <div className={styles.stats} aria-label="Price history summary">
          <div className={styles.stat}><small>Lowest recorded</small><strong>{money(lowest as number)}</strong></div>
          <div className={styles.stat}><small>Average recorded</small><strong>{money(average as number)}</strong></div>
          <div className={styles.stat}><small>Highest recorded</small><strong>{money(highest as number)}</strong></div>
        </div>
      ) : null}
    </section>
  );
}
