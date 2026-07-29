import { cookies } from "next/headers";
import { refreshProductImage, removeProductImage } from "@/lib/products/product-image.actions";
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

export async function ProductImagePanel({ productId, productName, hasImage }: ProductImagePanelProps) {
  const cookieStore = await cookies();
  const searchStatus = parseStatus(cookieStore.get(statusCookieName(productId))?.value);
  const diagnostics = searchStatus?.diagnostics;

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
        Reject an incorrect image and immediately search trusted barcode, retailer and produce sources for a replacement for {productName}.
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
