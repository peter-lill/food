import { recoverProductImage } from "@/lib/products/image-recovery";
import { backgroundJobTypes, type BackgroundJob } from "@/lib/jobs/background-jobs";

type ProductImagePayload = { productId: string };

function assertProductImagePayload(payload: unknown): asserts payload is ProductImagePayload {
  if (!payload || typeof payload !== "object" || typeof (payload as ProductImagePayload).productId !== "string") {
    throw new Error("PRODUCT_IMAGE_ENRICHMENT requires a productId.");
  }
}

export async function executeBackgroundJob(job: BackgroundJob) {
  switch (job.type) {
    case backgroundJobTypes.productImageEnrichment: {
      assertProductImagePayload(job.payload);
      const result = await recoverProductImage(job.payload.productId);
      return {
        productId: job.payload.productId,
        imageUrl: result.imageUrl,
        status: result.status,
        selectedSource: result.diagnostics?.selectedSource ?? null,
      };
    }
    default:
      throw new Error(`Unsupported background job type: ${job.type}`);
  }
}
