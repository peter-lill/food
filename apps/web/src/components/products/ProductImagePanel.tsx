import { cookies } from "next/headers";
import { refreshProductImage, removeProductImage } from "@/lib/products/product-image.actions";

type ProductImagePanelProps = {
  productId: string;
  productName: string;
  hasImage: boolean;
};

type ImageSearchStatus = {
  tone: "success" | "warning" | "error";
  message: string;
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
    ) return { tone: parsed.tone, message: parsed.message };
  } catch {
    return null;
  }
  return null;
}

export async function ProductImagePanel({ productId, productName, hasImage }: ProductImagePanelProps) {
  const cookieStore = await cookies();
  const searchStatus = parseStatus(cookieStore.get(statusCookieName(productId))?.value);

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
        <p
          className={`badge ${searchStatus.tone === "success" ? "neutral" : "warning"}`}
          role="status"
        >
          {searchStatus.message}
        </p>
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
