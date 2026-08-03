"use client";

import { useState } from "react";

type ProductImageWithFallbackProps = {
  alt: string;
  productId: string;
};

export function ProductImageWithFallback({ alt, productId }: ProductImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return <span aria-hidden="true">&#9671;</span>;

  return <img alt={alt} onError={() => setFailed(true)} src={`/api/products/${encodeURIComponent(productId)}/image`} />;
}
