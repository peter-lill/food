import type { ParsedReceipt } from "./engine/parser";

export interface ReceiptOcrCandidate {
  ocrConfidence: number;
  parsed: ParsedReceipt;
  pass: "structured" | "sparse";
  text: string;
}

export function receiptCandidateScore(candidate: ReceiptOcrCandidate) {
  const { parsed, ocrConfidence } = candidate;
  return (
    parsed.confidence * 2
    + Math.min(parsed.items.length, 25) * 8
    + (parsed.retailer ? 12 : 0)
    + (parsed.purchasedAt ? 12 : 0)
    + (parsed.total !== null ? 16 : 0)
    + Math.max(0, Math.min(100, ocrConfidence))
    - parsed.warnings.length * 55
  );
}

export function chooseReceiptCandidate(candidates: ReceiptOcrCandidate[]) {
  return [...candidates].sort((left, right) => receiptCandidateScore(right) - receiptCandidateScore(left))[0] ?? null;
}

export function needsReceiptFallback(candidate: ReceiptOcrCandidate) {
  return candidate.parsed.items.length === 0
    || candidate.parsed.warnings.length > 0
    || candidate.parsed.confidence < 80
    || candidate.ocrConfidence < 55;
}
