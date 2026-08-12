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

export function chooseReceiptDate(candidates: ReceiptOcrCandidate[]) {
  const evidence = candidates.flatMap((candidate) => {
    const textLength = Math.max(1, candidate.text.length);
    return [...candidate.text.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/g)].map((match) => {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      return {
        date: `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`,
        score: (match.index ?? 0) / textLength
          + (canPopulateReceiptCandidate(candidate) ? 1 : 0)
          + (candidate.parsed.purchasedAt === `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` ? 2 : 0),
      };
    });
  });
  return evidence.sort((left, right) => right.score - left.score)[0]?.date
    ?? candidates.map((candidate) => candidate.parsed.purchasedAt).find((date): date is string => Boolean(date))
    ?? null;
}

export function needsReceiptFallback(candidate: ReceiptOcrCandidate) {
  return candidate.parsed.items.length === 0
    || candidate.parsed.diagnostics.totalLine === null
    || candidate.parsed.warnings.length > 0
    || candidate.parsed.confidence < 80
    || candidate.ocrConfidence < 55;
}

export function canPopulateReceiptCandidate(candidate: ReceiptOcrCandidate) {
  return receiptCandidatePopulationProblems(candidate).length === 0;
}

export function receiptCandidatePopulationProblems(candidate: ReceiptOcrCandidate) {
  const problems: string[] = [];
  if (!candidate.parsed.retailer) problems.push("missing retailer");
  if (candidate.parsed.diagnostics.totalLine === null || candidate.parsed.total === null) problems.push("missing explicit total");
  if (candidate.parsed.items.length < 3) problems.push("fewer than three product lines");
  if (candidate.parsed.warnings.some((warning) => /^Receipt reports \d+ items?, but /i.test(warning))) problems.push("reported item count does not reconcile");
  return problems;
}
