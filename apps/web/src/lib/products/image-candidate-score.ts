import type { ProductImageAssessment } from "@/lib/products/image-quality";

export function imageCandidateOverallScore(input: {
  qualityScore: number;
  providerScore: number;
  identityScore: number | null;
}) {
  return Math.round(
    (input.qualityScore * 0.65)
    + (input.providerScore * 0.25)
    + ((input.identityScore ?? 50) * 0.10),
  );
}

export function usableImageCandidateAssessment(assessment: ProductImageAssessment, minimumQuality = 55) {
  if (!assessment.reachable) return false;
  if (!assessment.contentType?.startsWith("image/")) return false;
  return assessment.score >= minimumQuality;
}
