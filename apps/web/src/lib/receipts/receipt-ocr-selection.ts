import type { ParsedReceiptItem } from "./engine/parser";
import type { ParsedReceipt } from "./engine/parser";
import { receiptStructureScore, type ReceiptOcrLine } from "./receipt-structure";

export interface ReceiptOcrCandidate {
  ocrConfidence: number;
  parsed: ParsedReceipt;
  pass: "structured" | "sparse";
  text: string;
  lines?: ReceiptOcrLine[];
}

function hasExplicitQuantity(item: ParsedReceiptItem) {
  return item.quantity > 1 && /(?:^|\|\s*)(?:\d+(?:\.\d+)?\s*@|\d[0o])\s*\$?\s*\d+[.,]\d{1,2}/i.test(item.sourceText);
}

function identityTokens(description: string) {
  return new Set(description.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((token) => token.length > 1));
}

function sameItemIdentity(left: ParsedReceiptItem, right: ParsedReceiptItem) {
  const leftTokens = identityTokens(left.description);
  const rightTokens = identityTokens(right.description);
  const common = [...leftTokens].filter((token) => rightTokens.has(token));
  const sharedPack = common.some((token) => /^\d+(?:ml|l|g|kg|pack)$/.test(token));
  return sharedPack && common.length >= 3;
}

export function receiptCandidateScore(candidate: ReceiptOcrCandidate) {
  const { parsed, ocrConfidence } = candidate;
  const hasExplicitTotal = parsed.total !== null && parsed.diagnostics.totalLine !== null;
  const unpricedItems = parsed.items.filter((item) => item.price === null).length;
  const explicitQuantities = parsed.items.filter(hasExplicitQuantity).length;
  return (
    parsed.confidence * 2
    + Math.min(parsed.items.length, 25) * 8
    + (parsed.retailer ? 12 : 0)
    + (parsed.purchasedAt ? 12 : 0)
    + (hasExplicitTotal ? 35 : -120)
    + explicitQuantities * 20
    - unpricedItems * 18
    + Math.max(0, Math.min(100, ocrConfidence))
    + receiptStructureScore(candidate.lines ?? candidate.text.split(/\r?\n/).filter(Boolean).map((text) => ({ text, confidence: 0, bbox: null })))
    - parsed.warnings.length * 55
  );
}

function sameReceiptMetadata(candidate: ReceiptOcrCandidate, best: ReceiptOcrCandidate) {
  if (candidate.parsed.retailerKey !== best.parsed.retailerKey) return false;
  if (candidate.parsed.diagnostics.totalLine !== null && best.parsed.diagnostics.totalLine !== null
    && candidate.parsed.total !== null && best.parsed.total !== null
    && Math.abs(candidate.parsed.total - best.parsed.total) > 0.05) return false;
  return true;
}

function sameReceiptItems(candidate: ReceiptOcrCandidate, best: ReceiptOcrCandidate) {
  return sameReceiptMetadata(candidate, best)
    && candidate.parsed.total !== null
    && best.parsed.total !== null
    && Math.abs(candidate.parsed.total - best.parsed.total) <= 0.05
    && candidate.parsed.items.length === best.parsed.items.length;
}

function localIsoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function chooseCorroboratedDate(best: ReceiptOcrCandidate, candidates: ReceiptOcrCandidate[], now: Date) {
  const today = localIsoDate(now);
  const evidence = new Map<string, { count: number; score: number }>();
  for (const candidate of candidates) {
    if (!sameReceiptMetadata(candidate, best)) continue;
    const date = candidate.parsed.purchasedAt;
    if (!date || date > today) continue;
    const current = evidence.get(date) ?? { count: 0, score: Number.NEGATIVE_INFINITY };
    current.count += 1;
    current.score = Math.max(current.score, receiptCandidateScore(candidate));
    evidence.set(date, current);
  }
  const ranked = [...evidence.entries()].sort((left, right) =>
    right[1].count - left[1].count || right[1].score - left[1].score || right[0].localeCompare(left[0]));
  return ranked[0]?.[0] ?? null;
}

export function combineReceiptCandidateEvidence(best: ReceiptOcrCandidate, candidates: ReceiptOcrCandidate[], now = new Date()): ReceiptOcrCandidate {
  const itemCandidates = candidates.filter((candidate) => sameReceiptItems(candidate, best));
  let changed = false;
  const items = best.parsed.items.map((item, index) => {
    const evidence = itemCandidates
      .map((candidate) => ({ candidate, item: candidate.parsed.items[index] }))
      .filter((entry): entry is { candidate: ReceiptOcrCandidate; item: ParsedReceiptItem } => Boolean(entry.item));
    const identityQuantityEvidence = candidates
      .filter((candidate) => sameReceiptMetadata(candidate, best))
      .flatMap((candidate) => candidate.parsed.items.map((candidateItem) => ({ candidate, item: candidateItem })))
      .filter((entry) => hasExplicitQuantity(entry.item) && sameItemIdentity(item, entry.item));

    let quantity = item.quantity;
    let price = item.price;
    let sourceText = item.sourceText;
    let confidence = item.confidence;

    if (!hasExplicitQuantity(item)) {
      const explicit = [...evidence.filter((entry) => hasExplicitQuantity(entry.item)), ...identityQuantityEvidence]
        .sort((left, right) => receiptCandidateScore(right.candidate) - receiptCandidateScore(left.candidate))[0];
      if (explicit && explicit.item.quantity !== quantity) {
        quantity = explicit.item.quantity;
        sourceText = `${sourceText} | corroborated: ${explicit.item.sourceText}`;
        confidence = Math.max(confidence, explicit.item.confidence);
        changed = true;
      }
    }

    if (price === null) {
      const priced = evidence
        .filter((entry) => entry.item.price !== null)
        .sort((left, right) => receiptCandidateScore(right.candidate) - receiptCandidateScore(left.candidate))[0];
      if (priced?.item.price !== null && priced?.item.price !== undefined) {
        price = priced.item.price;
        sourceText = `${sourceText} | corroborated: ${priced.item.sourceText}`;
        confidence = Math.max(confidence, priced.item.confidence);
        changed = true;
      }
    }

    return changed && (quantity !== item.quantity || price !== item.price)
      ? { ...item, quantity, price, sourceText, confidence }
      : item;
  });

  const purchasedAt = chooseCorroboratedDate(best, candidates, now);
  if (purchasedAt !== best.parsed.purchasedAt) changed = true;

  const detectedUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const warnings = best.parsed.warnings.filter((warning) => {
    const count = warning.match(/^Receipt reports (\d+) items?, but /i)?.[1];
    return !count || Number(count) !== detectedUnits;
  });
  if (warnings.length !== best.parsed.warnings.length) changed = true;

  if (!changed) return best;
  return {
    ...best,
    parsed: {
      ...best.parsed,
      purchasedAt,
      items,
      warnings,
    },
  };
}

export function chooseReceiptCandidate(candidates: ReceiptOcrCandidate[]) {
  const best = [...candidates].sort((left, right) => {
    const populationDifference = Number(canPopulateReceiptCandidate(right)) - Number(canPopulateReceiptCandidate(left));
    return populationDifference || receiptCandidateScore(right) - receiptCandidateScore(left);
  })[0] ?? null;
  return best ? combineReceiptCandidateEvidence(best, candidates) : null;
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
    || candidate.parsed.items.some((item) => item.price === null)
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
