import Link from "next/link";
import { getProductRepairQueue } from "@/lib/product-intelligence/product-repair-workflow";
import {
  approveRepairAction,
  generateRepairSuggestionsAction,
  rejectRepairAction,
} from "./actions";
import styles from "./repairs.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Repair Queue | Food Admin",
};

function formatRule(value: string) {
  return value.replaceAll("-", " ");
}

export default async function ProductRepairQueuePage() {
  const repairs = await getProductRepairQueue();

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className="eyebrow">ADMIN · DATA INTEGRITY</p>
          <h1>Product repair queue</h1>
          <p>Review suggested canonical name changes before anything is written to the catalogue.</p>
        </div>
        <div className={styles.heroActions}>
          <form action={generateRepairSuggestionsAction}>
            <input name="limit" type="hidden" value="2000" />
            <button className="primary-button" type="submit">Scan catalogue</button>
          </form>
          <Link className="secondary-button" href="/admin">Admin home</Link>
        </div>
      </header>

      <section className={styles.summary}>
        <article>
          <span>Pending</span>
          <strong>{repairs.length}</strong>
          <small>owner decisions required</small>
        </article>
        <article>
          <span>High confidence</span>
          <strong>{repairs.filter((item) => item.confidence >= 98).length}</strong>
          <small>still require approval</small>
        </article>
        <article>
          <span>Protected field</span>
          <strong>Name</strong>
          <small>no automatic overwrites</small>
        </article>
      </section>

      <section className={styles.queueSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">PENDING SUGGESTIONS</p>
            <h2>Review proposed changes</h2>
          </div>
          <p>Approving records the old and new values, rule, account and timestamp. Rejected suggestions leave the product unchanged.</p>
        </div>

        {repairs.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No pending name repairs.</strong>
            <p>Scan the catalogue to create suggestions from current validation results.</p>
          </div>
        ) : (
          <div className={styles.queue}>
            {repairs.map((repair) => (
              <article className={styles.repairCard} key={repair.id}>
                <div className={styles.cardHeader}>
                  <div>
                    <span className={styles.confidence}>{repair.confidence}% confidence</span>
                    <h3>{repair.productName}</h3>
                    <p>{repair.brand || "Brand not recorded"} · {repair.category || "Uncategorised"}</p>
                  </div>
                  <Link className={styles.inspectLink} href={`/admin/product-intelligence/inspector?productId=${encodeURIComponent(repair.productId)}`}>
                    Open Inspector →
                  </Link>
                </div>

                <div className={styles.comparison}>
                  <div>
                    <span>Current canonical name</span>
                    <strong>{repair.previousValue}</strong>
                  </div>
                  <span className={styles.arrow} aria-hidden="true">→</span>
                  <div className={styles.proposed}>
                    <span>Proposed name</span>
                    <strong>{repair.proposedValue}</strong>
                  </div>
                </div>

                <div className={styles.meta}>
                  <span><strong>Rule:</strong> {formatRule(repair.rule)}</span>
                  <span><strong>Flagged:</strong> {repair.createdAt.toLocaleString("en-AU")}</span>
                  {repair.issues.length ? <span><strong>Issues:</strong> {repair.issues.join(", ")}</span> : null}
                </div>

                <div className={styles.actions}>
                  <form action={approveRepairAction}>
                    <input name="suggestionId" type="hidden" value={repair.id} />
                    <button className="primary-button" type="submit">Approve change</button>
                  </form>
                  <form action={rejectRepairAction}>
                    <input name="suggestionId" type="hidden" value={repair.id} />
                    <button className="secondary-button" type="submit">Reject suggestion</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
