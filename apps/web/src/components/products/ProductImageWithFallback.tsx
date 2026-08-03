"use client";

import { useState } from "react";

type ProductImageWithFallbackProps = {
  alt: string;
  imageVersion?: string | null;
  productId: string;
};

export function ProductImageWithFallback({ alt, imageVersion, productId }: ProductImageWithFallbackProps) {
  const [attempt, setAttempt] = useState(0);

  if (attempt > 1) return <span aria-hidden="true">&#9671;</span>;

  const safeVersion = imageVersion?.replace(/[^a-zA-Z0-9_-]/g, "") ?? "current";
  const version = `?v=${encodeURIComponent(safeVersion)}&attempt=${attempt}`;
  return <img alt={alt} onError={() => setAttempt((current) => current + 1)} src={`/api/products/${encodeURIComponent(productId)}/image${version}`} />;
}
