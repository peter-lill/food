import styles from "./PriceComparisonGuide.module.css";

export function PriceComparisonGuide() {
  return (
    <section className={styles.guide} aria-label="How price comparisons work">
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">HOW TO READ PRICES</p>
          <h2>Compare like with like</h2>
        </div>
        <p>Food highlights the cheapest comparable price, but pack size, freshness and retailer coverage still matter.</p>
      </div>
      <div className={styles.grid}>
        <article>
          <span aria-hidden="true">$</span>
          <div><strong>Shelf price</strong><p>The amount charged for the full pack.</p></div>
        </article>
        <article>
          <span aria-hidden="true">÷</span>
          <div><strong>Unit price</strong><p>Used for like-for-like comparison when the unit basis is available.</p></div>
        </article>
        <article>
          <span aria-hidden="true">◷</span>
          <div><strong>Checked date</strong><p>Shows how fresh each observation is. Older prices may have changed.</p></div>
        </article>
        <article>
          <span aria-hidden="true">!</span>
          <div><strong>Coverage</strong><p>Missing retailers are not assumed to be more expensive—they simply have no matching price.</p></div>
        </article>
      </div>
      <p className={styles.note}><strong>Specials:</strong> promotional prices are labelled separately and may expire before the next check.</p>
    </section>
  );
}
