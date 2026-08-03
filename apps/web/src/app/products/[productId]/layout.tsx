import type { ReactNode } from "react";
import { RetailerIntelligencePanel } from "@/components/products/RetailerIntelligencePanel";

type ProductDetailLayoutProps = {
  children: ReactNode;
  params: Promise<{ productId: string }>;
};

export default async function ProductDetailLayout({
  children,
  params,
}: ProductDetailLayoutProps) {
  const { productId } = await params;
  const decodedProductId = decodeURIComponent(productId);

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <RetailerIntelligencePanel productIdOrSlug={decodedProductId} />
      </div>
      {children}
    </>
  );
}
