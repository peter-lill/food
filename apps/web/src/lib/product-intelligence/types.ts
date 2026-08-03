import type {
  EnrichmentJobStatus,
  Prisma,
  ProductLifecycle,
  ProductType,
} from "@prisma/client";

export type ProductSearchOptions = {
  query?: string;
  productType?: ProductType;
  lifecycle?: ProductLifecycle;
  take?: number;
};

export type CreateProductInput = {
  name: string;
  canonicalName?: string | null;
  slug?: string | null;
  brand?: string | null;
  barcode?: string | null;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  packSize?: string | null;
  packQuantity?: number | null;
  packUnit?: string | null;
  productType?: ProductType;
  lifecycle?: ProductLifecycle;
  confidenceScore?: number;
  foodKnowledgeId?: string | null;
};

export type UpdateProductInput = Prisma.ProductUpdateInput;

export type EnqueueProductEnrichmentInput = {
  productId: string;
  provider: string;
  priority?: number;
};

export type EnrichmentJobFilter = {
  status?: EnrichmentJobStatus;
  productId?: string;
  take?: number;
};
