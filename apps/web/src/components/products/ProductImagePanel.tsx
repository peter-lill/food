import { cookies } from "next/headers";
import {
  refreshProductImage,
  rejectGalleryImageCandidate,
  removeProductImage,
  restoreGalleryImageCandidate,
  selectProductImageCandidate,
} from "@/lib/products/product-image.actions";
import { resolveDirectRetailerImage } from "@/lib/products/direct-retailer-image.actions";
import { listProductImageCandidates } from "@/lib/products/image-candidate.repository";
import { enrichProductFromRetailerLabels } from "@/lib/product-intelligence/retailer-label-enrichment";
import type { ImageSearchDiagnostics } from "@/lib/products/image-recovery";
import { ProductLabelSupplement } from "./ProductLabelSupplement";
import styles from "./ProductImagePanel.module.css";

type ProductImagePanelProps = {
  productId: string;
  productName: string;
  hasImage: boolean;
};

type ImageSearchStatus = {
  tone: "success" | "warning" | "error";
  message: string;
  diagnostics?: ImageSearchDiagnostics;
};

function statusCookieName(productId: string) {
  return `food-image-search-${productId}`;
}

function parseStatus(value: string | undefined): ImageSearchStatus | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ImageSearchStatus>;
    if (
      (parsed.tone === "success" || parsed.tone === "warning" || parsed.tone === "error")
      && typeof parsed.message === "string"
    ) {
      return {
        tone: parsed.tone,
        message: parsed.message,
        diagnostics: parsed.diagnostics,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function qualityLabel(score: number | null) {
  if (score === null) return "Not scored";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Fair";
  return "Needs review";
}

export async function ProductImagePanel({ productId, productName, hasImage }: ProductImagePanelProps) {
  await enrichProductFromRetailerLabels(productId).catch((error) => {
    console.warn("Retailer product label enrichment failed", {
      productId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const cookieStore = await cookies();
  const searchStatus = parseStatus(cookieStore.get(statusCookieName(productId))?.value);
  const diagnostics = searchStatus?.diagnostics;
  const candidates = await listProductImageCandidates(productId, 24).catch(() => []);
  const activeCandidates = candidates.filter((candidate) => !candidate.rejected);
  const rejectedCandidates = candidates.filter((candidate) => candidate.rejected);

  const renderCandidate = (candidate: (typeof candidates)[number]) => {
    const dimensions = candidate.width && candidate.height
      ? `${candidate.width} × ${candidate.height}`
      : "Size pending";
    const score = candidate.overallScore === null ? null : Math.round(candidate.overallScore);

    return (
      <article
        id={`image-candidate-${candidate.id}`}
        key={candidate.id}
        className={`${styles.candidate} ${candidate.selected ? styles.primary : ""} ${candidate.rejected ? styles.rejected : ""}`}
      >
        <div className={styles.preview}>
          <img
            alt={`${productName} candidate from ${candidate.sourceLabel || candidate.source}`}
            loading="lazy"
            src={`/api/products/${encodeURIComponent(productId)}/image-candidates/${encodeURIComponent(candidate.id)}`}
          />
        </div>

        <div className={styles.candidateHeader}>
          <strong className={styles.source}>{candidate.sourceLabel || candidate.source}</strong>
          <span className={`badge ${candidate.selected ? "neutral" : candidate.rejected ? "warning" : ""}`}>
            {candidate.selected ? "Primary" : candidate.rejected ? "Rejected" : candidate.accepted ? "Usable" : "Review"}
          </span>
        </div>

        <p className={styles.meta}>
          <span>{qualityLabel(candidate.overallScore)}</span>
          {score !== null ? <span>{score}%</span> : null}
          <span>{dimensions}</span>
        </p>

        {candidate.selected ? <p className={styles.localNote}>Stored and served by Food</p> : null}

        <div className={styles.actions}>
          {!candidate.selected ? (
            <form action={selectProductImageCandidate.bind(null, productId, candidate.id)}>
              <button className={`primary-button ${styles.primaryAction}`} type="submit">Make primary</button>
            </form>
          ) : null}
          {candidate.rejected ? (
            <form action={restoreGalleryImageCandidate.bind(null, productId, candidate.id)}>
              <button className={`secondary-button ${styles.secondaryAction}`} type="submit">Restore</button>
            </form>
          ) : (
            <form action={rejectGalleryImageCandidate.bind(null, productId, candidate.id)}>
              <button className={`danger-button ${styles.dangerAction}`} type="submit">Reject</button>
            </form>
          )}
        </div>
      </article>
    );
  };

  return (
    <article className={`card ${styles.panel}`} id="image-intelligence">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">IMAGE INTELLIGENCE</p>
          <h2 className="section-title">Product image</h2>
        </div>
        <span className={`badge ${hasImage ? "neutral" : "warning"}`}>
          {hasImage ? "Image selected" : "Image needed"}
        </span>
      </div>

      <p className={`subtle ${styles.intro}`}>
        Food searches trusted product, retailer and food sources. Compare the candidates below and choose the best image for {productName}.
      </p>

      {searchStatus ? (
        <p className={`badge ${searchStatus.tone === "success" ? "neutral" : "warning"} ${styles.status}`} role="status">
          {searchStatus.message}
        </p>
      ) : null}

      {activeCandidates.length ? (
        <details className={styles.gallerySection} open>
          <summary className={styles.summary}>Candidate images ({activeCandidates.length})</summary>
          <div className={styles.gallery}>{activeCandidates.map(renderCandidate)}</div>
        </details>
      ) : (
        <p className="subtle">No image candidates are currently available.</p>
      )}

      {rejectedCandidates.length ? (
        <details className={styles.rejectedSection}>
          <summary className={styles.summary}>Rejected images ({rejectedCandidates.length})</summary>
          <p className="subtle">Rejected images are retained and can be restored at any time.</p>
          <div className={styles.gallery}>{rejectedCandidates.map(renderCandidate)}</div>
        </details>
      ) : null}

      <details className={styles.advanced}>
        <summary className={styles.summary}>Advanced tools</summary>
        <div className={styles.advancedBody}>
          <form action={resolveDirectRetailerImage.bind(null, productId)} className={styles.resolver}>
            <label className="field">
              <span>Retailer product page</span>
              <input name="retailerReference" placeholder="Paste a Woolworths product link" required />
            </label>
            <div className="form-actions">
              <button className="secondary-button" type="submit">Retrieve retailer image</button>
            </div>
          </form>

          {diagnostics ? (
            <details>
              <summary className={styles.summary}>Search diagnostics</summary>
              <div className={styles.diagnostics}>
                <div>
                  <strong>Identity</strong>
                  <p className="subtle">
                    {diagnostics.identity}{diagnostics.barcode ? ` · Barcode ${diagnostics.barcode}` : " · No barcode"}
                  </p>
                </div>

                {diagnostics.queries.length ? (
                  <div>
                    <strong>Queries</strong>
                    <p className="subtle">{diagnostics.queries.join(" · ")}</p>
                  </div>
                ) : null}

                <div>
                  <strong>Providers</strong>
                  {diagnostics.steps.map((step, index) => (
                    <div className={styles.providerRow} key={`${step.provider}-${index}`}>
                      <span><strong>{step.provider}</strong><br /><small>{step.candidates} candidate{step.candidates === 1 ? "" : "s"}</small></span>
                      <span className="subtle">{step.status === "skipped" ? "Skipped: " : step.status === "failed" ? "Failed: " : ""}{step.detail}</span>
                    </div>
                  ))}
                </div>

                {diagnostics.validation.length ? (
                  <div>
                    <strong>Candidate validation</strong>
                    {diagnostics.validation.slice(0, 12).map((item, index) => (
                      <div className={styles.validationRow} key={`${item.source}-${index}`}>
                        <span>{item.accepted ? "✓" : "✕"} {item.source}</span>
                        <span className="subtle">{item.reason}{item.score === null ? "" : ` · Score ${item.score}`}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </details>

      <div className={styles.footerActions}>
        {hasImage ? (
          <form action={removeProductImage.bind(null, productId)}>
            <button className="danger-button" type="submit">Reject and replace image</button>
          </form>
        ) : null}
        <form action={refreshProductImage.bind(null, productId)}>
          <button className="secondary-button" type="submit">Refresh image search</button>
        </form>
      </div>

      <ProductLabelSupplement productId={productId} />
    </article>
  );
}
