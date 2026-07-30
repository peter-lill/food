import { cookies } from "next/headers";
import {
  refreshProductImage,
  rejectGalleryImageCandidate,
  removeProductImage,
  restoreGalleryImageCandidate,
  selectProductImageCandidate,
} from "@/lib/products/product-image.actions";
import { listProductImageCandidates } from "@/lib/products/image-candidate.repository";
import type { ImageSearchDiagnostics } from "@/lib/products/image-recovery";

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
    ) return {
      tone: parsed.tone,
      message: parsed.message,
      diagnostics: parsed.diagnostics,
    };
  } catch {
    return null;
  }
  return null;
}

function scoreLabel(score: number | null) {
  if (score === null) return "Not scored";
  if (score >= 90) return `Excellent · ${Math.round(score)}`;
  if (score >= 75) return `Good · ${Math.round(score)}`;
  if (score >= 50) return `Acceptable · ${Math.round(score)}`;
  return `Needs review · ${Math.round(score)}`;
}

export async function ProductImagePanel({ productId, productName, hasImage }: ProductImagePanelProps) {
  const cookieStore = await cookies();
  const searchStatus = parseStatus(cookieStore.get(statusCookieName(productId))?.value);
  const diagnostics = searchStatus?.diagnostics;
  const candidates = await listProductImageCandidates(productId, 24).catch(() => []);
  const activeCandidates = candidates.filter((candidate) => !candidate.rejected);
  const rejectedCandidates = candidates.filter((candidate) => candidate.rejected);

  const renderCandidate = (candidate: (typeof candidates)[number]) => {
    const dimensions = candidate.width && candidate.height ? `${candidate.width} × ${candidate.height}` : "Dimensions unknown";
    const reasons = candidate.rejectionReasons.length
      ? candidate.rejectionReasons.join(" · ")
      : candidate.accepted ? "Passed validation" : "Awaiting assessment";

    return (
      <article
        key={candidate.id}
        style={{
          border: "1px solid var(--border)",
          borderRadius: "18px",
          padding: "12px",
          display: "grid",
          gap: "10px",
          background: candidate.selected ? "var(--surface-soft, #f1faf5)" : "var(--surface, #fff)",
          opacity: candidate.rejected ? 0.82 : 1,
        }}
      >
        <div style={{ aspectRatio: "1 / 1", borderRadius: "14px", overflow: "hidden", background: "#f4f4f0", display: "grid", placeItems: "center" }}>
          <img
            alt={`${productName} candidate from ${candidate.sourceLabel}`}
            src={`/api/products/${encodeURIComponent(productId)}/image-candidates/${encodeURIComponent(candidate.id)}`}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
            <strong>{candidate.sourceLabel || candidate.source}</strong>
            <span className={`badge ${candidate.selected ? "neutral" : candidate.rejected ? "warning" : ""}`}>
              {candidate.selected ? "Primary" : candidate.rejected ? "Rejected" : candidate.accepted ? "Usable" : "Review"}
            </span>
          </div>
          <p className="subtle" style={{ margin: "6px 0 0" }}>{scoreLabel(candidate.overallScore)} · {dimensions}</p>
          <p className="subtle" style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>{reasons}</p>
        </div>
        <div className="form-actions" style={{ marginTop: 0, justifyContent: "flex-start" }}>
          {!candidate.selected ? (
            <form action={selectProductImageCandidate.bind(null, productId, candidate.id)}>
              <button className="primary-button" type="submit">Make primary</button>
            </form>
          ) : null}
          {candidate.rejected ? (
            <form action={restoreGalleryImageCandidate.bind(null, productId, candidate.id)}>
              <button className="secondary-button" type="submit">Restore to review</button>
            </form>
          ) : (
            <form action={rejectGalleryImageCandidate.bind(null, productId, candidate.id)}>
              <button className="danger-button" type="submit">Reject</button>
            </form>
          )}
        </div>
      </article>
    );
  };

  return (
    <article className="card">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">IMAGE INTELLIGENCE</p>
          <h2 className="section-title">Product image</h2>
        </div>
        <span className={`badge ${hasImage ? "neutral" : "warning"}`}>
          {hasImage ? "Image selected" : "Image needed"}
        </span>
      </div>
      <p className="subtle">
        Compare discovered images, choose the primary image, or restore a previously rejected candidate for {productName}.
      </p>
      {searchStatus ? (
        <p className={`badge ${searchStatus.tone === "success" ? "neutral" : "warning"}`} role="status">
          {searchStatus.message}
        </p>
      ) : null}

      {diagnostics ? (
        <details style={{ marginTop: "16px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>Search diagnostics</summary>
          <div style={{ display: "grid", gap: "14px", marginTop: "14px" }}>
            <div>
              <strong>Identity</strong>
              <p className="subtle" style={{ margin: "4px 0 0" }}>
                {diagnostics.identity}{diagnostics.barcode ? ` · Barcode ${diagnostics.barcode}` : " · No barcode"}
              </p>
            </div>

            {diagnostics.queries.length ? (
              <div>
                <strong>Queries</strong>
                <p className="subtle" style={{ margin: "4px 0 0" }}>{diagnostics.queries.join(" · ")}</p>
              </div>
            ) : null}

            <div style={{ display: "grid", gap: "8px" }}>
              <strong>Providers</strong>
              {diagnostics.steps.map((step, index) => (
                <div key={`${step.provider}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(130px, 0.8fr) minmax(0, 2fr)", gap: "10px", padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                  <span><strong>{step.provider}</strong><br /><small>{step.candidates} candidate{step.candidates === 1 ? "" : "s"}</small></span>
                  <span className="subtle">{step.status === "skipped" ? "Skipped: " : step.status === "failed" ? "Failed: " : ""}{step.detail}</span>
                </div>
              ))}
            </div>

            {diagnostics.validation.length ? (
              <div style={{ display: "grid", gap: "8px" }}>
                <strong>Candidate validation</strong>
                {diagnostics.validation.slice(0, 12).map((item, index) => (
                  <div key={`${item.source}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                    <span>{item.accepted ? "✓" : "✕"} {item.source}</span>
                    <span className="subtle" style={{ textAlign: "right" }}>{item.reason}{item.score === null ? "" : ` · Score ${item.score}`}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <p className="subtle" style={{ margin: 0 }}>
              {diagnostics.selectedSource ? `Selected from ${diagnostics.selectedSource}.` : "No candidate passed validation."}
            </p>
          </div>
        </details>
      ) : null}

      {activeCandidates.length ? (
        <details open style={{ marginTop: "22px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>Candidate gallery ({activeCandidates.length})</summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "14px", marginTop: "14px" }}>
            {activeCandidates.map(renderCandidate)}
          </div>
        </details>
      ) : null}

      {rejectedCandidates.length ? (
        <details style={{ marginTop: "18px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>Rejected images ({rejectedCandidates.length})</summary>
          <p className="subtle">Rejected images are retained. Restore one to return it to the main gallery, or make it primary immediately.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "14px", marginTop: "14px" }}>
            {rejectedCandidates.map(renderCandidate)}
          </div>
        </details>
      ) : null}

      <div className="form-actions">
        {hasImage ? (
          <form action={removeProductImage.bind(null, productId)}>
            <button className="danger-button" type="submit">Reject and replace image</button>
          </form>
        ) : null}
        <form action={refreshProductImage.bind(null, productId)}>
          <button className="secondary-button" type="submit">Search for image</button>
        </form>
      </div>
    </article>
  );
}
