import type { ParsedReceipt } from "./engine/parser";
import { receiptStructureScore, type ReceiptOcrLine } from "./receipt-structure";

export interface ReceiptOcrCandidate {
  ocrConfidence: number;
  parsed: ParsedReceipt;
  pass: "structured" | "sparse";
  text: string;
  lines?: ReceiptOcrLine[];
}

export function receiptCandidateScore(candidate: ReceiptOcrCandidate) {
  const { parsed, ocrConfidence } = candidate;
  const hasExplicitTotal = parsed.total !== null && parsed.diagnostics.totalLine !== null;
  return (
    parsed.confidence * 2
    + Math.min(parsed.items.length, 25) * 8
    + (parsed.retailer ? 12 : 0)
    + (parsed.purchasedAt ? 12 : 0)
    + (hasExplicitTotal ? 35 : -120)
    + Math.max(0, Math.min(100, ocrConfidence))
    + receiptStructureScore(candidate.lines ?? candidate.text.split(/\r?\n/).filter(Boolean).map((text) => ({ text, confidence: 0, bbox: null })))
    - parsed.warnings.length * 55
  );
}

export function chooseReceiptCandidate(candidates: ReceiptOcrCandidate[]) {
  return [...candidates].sort((left, right) => {
    const populationDifference = Number(canPopulateReceiptCandidate(right)) - Number(canPopulateReceiptCandidate(left));
    return populationDifference || receiptCandidateScore(right) - receiptCandidateScore(left);
  })[0] ?? null;
}

export function needsReceiptFallback(candidate: ReceiptOcrCandidate) {
  return candidate.parsed.items.length === 0
    || candidate.parsed.diagnostics.totalLine === null
    || candidate.parsed.warnings.length > 0
    || candidate.parsed.confidence < 80
    || candidate.ocrConfidence < 55;
}

export function canPopulateReceiptCandidate(candidate: ReceiptOcrCandidate) {
  const itemCountMismatch = candidate.parsed.warnings.some((warning) => /^Receipt reports \d+ items?, but /i.test(warning));
  return Boolean(candidate.parsed.retailer)
    && candidate.parsed.diagnostics.totalLine !== null
    && candidate.parsed.total !== null
    && candidate.parsed.items.length >= 3
    && !itemCountMismatch;
}
