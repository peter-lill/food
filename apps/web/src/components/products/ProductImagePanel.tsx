import { refreshProductImage, removeProductImage } from "@/lib/products/product-image.actions";

type ProductImagePanelProps = {
  productId: string;
  productName: string;
  hasImage: boolean;
};

export function ProductImagePanel({ productId, productName, hasImage }: ProductImagePanelProps) {
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
