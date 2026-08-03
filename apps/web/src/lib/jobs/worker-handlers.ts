import { backgroundJobTypes, type BackgroundJob } from "@/lib/jobs/background-jobs";
import { importCandidateAsset } from "@/lib/images/image-asset.service";
import { recoverProductImage } from "@/lib/products/image-recovery";

export const workerJobTypes = {
  ...backgroundJobTypes,
  importProductImage: "IMPORT_PRODUCT_IMAGE",
} as const;

type ImportProductImagePayload = {
  productId: string;
  candidateId: string;
  provider?: string;
};

type ProductImageEnrichmentPayload = {
  productId: string;
};

function requireString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Job payload is missing ${key}`);
  }
  return value;
}

export function providerForJob(job: BackgroundJob) {
  const payload = job.payload as Record<string, unknown>;
  const provider = typeof payload.provider === "string" ? payload.provider.toLowerCase() : "";
  if (provider.includes("woolworths")) return "woolworths";
  if (provider.includes("coles")) return "coles";
  if (provider.includes("open food facts")) return "open-food-facts";
  if (provider.includes("wikimedia")) return "wikimedia";
  return "default";
}

export async function handleBackgroundJob(job: BackgroundJob) {
  const payload = job.payload as Record<string, unknown>;

  switch (job.type) {
    case workerJobTypes.importProductImage: {
      const typed: ImportProductImagePayload = {
        productId: requireString(payload, "productId"),
        candidateId: requireString(payload, "candidateId"),
        provider: typeof payload.provider === "string" ? payload.provider : undefined,
      };
      const asset = await importCandidateAsset(typed.productId, typed.candidateId);
      return {
        productId: typed.productId,
        candidateId: typed.candidateId,
        assetId: asset.id,
        sha256: asset.sha256,
        bytes: asset.fileSizeBytes,
      };
    }

    case workerJobTypes.productImageEnrichment: {
      const typed: ProductImageEnrichmentPayload = {
        productId: requireString(payload, "productId"),
      };
      const result = await recoverProductImage(typed.productId, { allowGenerated: true });
      return {
        productId: typed.productId,
        status: result.status,
        imageUrl: result.imageUrl,
      };
    }

    default:
      throw new Error(`No worker handler is registered for job type ${job.type}`);
  }
}
