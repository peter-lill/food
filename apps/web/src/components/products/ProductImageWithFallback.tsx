"use client";

import { useState } from "react";

type ProductImageWithFallbackProps = {
  alt: string;
  imageVersion?: string | null;
  productId: string;
};

export function ProductImageWithFallback({ alt, imageVersion, productId }: ProductImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return <span aria-hidden="true">&#9671;</span>;

  const version = imageVersion ? `?v=${encodeURIComponent(imageVersion)}` : "";
  return <img alt={alt} onError={() => setFailed(true)} src={`/api/products/${encodeURIComponent(productId)}/image${version}`} />;
}
