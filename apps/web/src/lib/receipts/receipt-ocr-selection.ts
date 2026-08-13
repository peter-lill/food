import type { ParsedReceipt, ParsedReceiptItem } from "./engine/parser";
import { receiptStructureScore, type ReceiptOcrLine } from "./receipt-structure";

export interface ReceiptOcrCandidate {
  ocrConfidence: number;
  parsed: ParsedReceipt;
  pass: "structured" | "sparse";
  text: string;
  lines?: ReceiptOcrLine[];
}

function hasExplicitQuantity(item: ParsedReceiptItem) {
  return item.quantity > 1 && /(?:^|\|\s*)\d+(?:\.\d+)?\s*@\s*\$?\s*\d+[.,]\d{2}/i.test(item.sourceText);
}

function normaliseEvidenceText(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function expectedItemCount(candidate: ReceiptOcrCandidate) {
  const lines = [candidate.parsed.diagnostics.totalLine, ...candidate.parsed.diagnostics.normalisedLines].filter((value): value is string => Boolean(value));
  for (const line of lines) {
    const match = line.match(/(?:total|[\[({]?otal)\s+(?:for\s+)?(\d+)\s+items?/i)
      ?? line.match(/^(\d+)\s+items?:?$/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function hasPackShape(value: string) {
  return /\b\d+(?:\.\d+)?\s*(?:ml|l|litres?|liters?|g|grams?|kg|packs?|pk)\b/i.test(value);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function itemAnchorY(candidate: ReceiptOcrCandidate, item: ParsedReceiptItem) {
  const lines = candidate.lines?.filter((line) => line.bbox) ?? [];
  if (!lines.length) return null;
  const source = normaliseEvidenceText(item.sourceText.split("|")[0] ?? "");
  const description = normaliseEvidenceText(item.description);
  const descriptionTokens = description.split(" ").filter((token) => token.length > 2);
  let best: { score: number; y: number } | null = null;

  for (const line of lines) {
    if (!line.bbox) continue;
    const text = normaliseEvidenceText(line.text);
    if (!text) continue;
    let score = 0;
    if (source && text === source) score = 10;
    else if (description && (text.includes(description) || description.includes(text))) score = 8;
    else if (descriptionTokens.length) {
      const matched = descriptionTokens.filter((token) => text.includes(token)).length;
      score = matched / descriptionTokens.length;
    }
    if (!best || score > best.score) best = { score, y: line.bbox.y0 };
  }
  return best && best.score >= .5 ? best.y : null;
}

type ItemEntry = { item: ParsedReceiptItem; y: number | null };

function inferMissingUnitsFromGeometry(entries: ItemEntry[], expected: number) {
  const detected = entries.reduce((sum, entry) => sum + entry.item.quantity, 0);
  const shortage = expected - detected;
  if (shortage <= 0 || shortage > 3) return null;

  const gaps = entries.slice(0, -1).flatMap((entry, index) => {
    const next = entries[index + 1];
    return entry.y !== null && next.y !== null && next.y > entry.y ? [next.y - entry.y] : [];
  });
  const baseline = median(gaps.filter((gap) => gap > 0));
  if (!baseline || baseline < 4) return null;

  const candidates = entries.slice(0, -1).map((entry, index) => {
    const next = entries[index + 1];
    const gap = entry.y !== null && next.y !== null ? next.y - entry.y : 0;
    return { index, gap, entry };
  }).filter(({ gap, entry }) =>
    gap >= baseline * 1.55
    && entry.item.quantity === 1
    && !hasExplicitQuantity(entry.item));

  if (candidates.length < shortage) return null;
  const selected = new Set(candidates.sort((left, right) => right.gap - left.gap).slice(0, shortage).map((entry) => entry.index));
  const repaired = entries.map((entry, index) => selected.has(index)
    ? {
        ...entry,
        item: {
          ...entry.item,
          quantity: entry.item.quantity + 1,
          confidence: Math.min(entry.item.confidence, 84),
          sourceText: `${entry.item.sourceText} | quantity inferred from receipt layout`,
        },
      }
    : entry);

  return repaired.reduce((sum, entry) => sum + entry.item.quantity, 0) === expected ? repaired : null;
}

function mergeLikelySplitDescription(entries: ItemEntry[], index: number) {
  const current = entries[index];
  const next = entries[index + 1];
  if (!current || !next
    || current.item.price !== null
    || next.item.price === null
    || current.item.quantity !== 1
    || next.item.quantity !== 1
    || hasPackShape(current.item.description)
    || !hasPackShape(next.item.description)) return null;

  const words = normaliseEvidenceText(current.item.description).split(" ").filter(Boolean);
  const lastWord = words.at(-1) ?? "";
  if (words.length > 5 || (lastWord.length > 3 && words.length > 3)) return null;

  const merged: ItemEntry = {
    y: current.y ?? next.y,
    item: {
      ...next.item,
      description: `${current.item.description} ${next.item.description}`.replace(/\s+/g, " ").trim(),
      sourceText: `${current.item.sourceText} | ${next.item.sourceText}`,
      confidence: Math.min(current.item.confidence, next.item.confidence),
    },
  };
  return [...entries.slice(0, index), merged, ...entries.slice(index + 2)];
}

function structurallyRepairItems(candidate: ReceiptOcrCandidate) {
  const expected = expectedItemCount(candidate);
  if (!expected || !candidate.parsed.items.length || !candidate.lines?.some((line) => line.bbox)) return candidate;

  const originalEntries: ItemEntry[] = candidate.parsed.items.map((item) => ({ item, y: itemAnchorY(candidate, item) }));
  let repaired = inferMissingUnitsFromGeometry(originalEntries, expected);

  if (!repaired) {
    const detected = originalEntries.reduce((sum, entry) => sum + entry.item.quantity, 0);
    if (detected >= expected && originalEntries.some((entry) => entry.item.price === null)) {
      for (let index = 0; index < originalEntries.length - 1; index += 1) {
        const merged = mergeLikelySplitDescription(originalEntries, index);
        if (!merged) continue;
        const withQuantity = inferMissingUnitsFromGeometry(merged, expected);
        if (withQuantity) {
          repaired = withQuantity;
          break;
        }
        if (merged.reduce((sum, entry) => sum + entry.item.quantity, 0) === expected) {
          repaired = merged;
          break;
        }
      }
    }
  }

  if (!repaired) return candidate;
  const items = repaired.map((entry) => entry.item);
  const detectedUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const warnings = candidate.parsed.warnings.filter((warning) => {
    const count = warning.match(/^Receipt reports (\d+) items?, but /i)?.[1];
    return !count || Number(count) !== detectedUnits;
  });
  return {
    ...candidate,
    parsed: {
      ...candidate.parsed,
      items,
      warnings,
    },
  };
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
  if (candidate.parsed.total !== null && best.parsed.total !== null
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
  const repairedBest = structurallyRepairItems(best);
  const repairedCandidates = candidates.map((candidate) => candidate === best ? repairedBest : structurallyRepairItems(candidate));
  const itemCandidates = repairedCandidates.filter((candidate) => sameReceiptItems(candidate, repairedBest));
  let changed = repairedBest !== best;
  const items = repairedBest.parsed.items.map((item, index) => {
    const evidence = itemCandidates
      .map((candidate) => ({ candidate, item: candidate.parsed.items[index] }))
      .filter((entry): entry is { candidate: ReceiptOcrCandidate; item: ParsedReceiptItem } => Boolean(entry.item));

    let quantity = item.quantity;
    let price = item.price;
    let sourceText = item.sourceText;
    let confidence = item.confidence;

    if (!hasExplicitQuantity(item)) {
      const explicit = evidence
        .filter((entry) => hasExplicitQuantity(entry.item))
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

    return quantity !== item.quantity || price !== item.price
      ? { ...item, quantity, price, sourceText, confidence }
      : item;
  });

  const purchasedAt = chooseCorroboratedDate(repairedBest, repairedCandidates, now);
  if (purchasedAt !== repairedBest.parsed.purchasedAt) changed = true;

  const detectedUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const warnings = repairedBest.parsed.warnings.filter((warning) => {
    const count = warning.match(/^Receipt reports (\d+) items?, but /i)?.[1];
    return !count || Number(count) !== detectedUnits;
  });
  if (warnings.length !== repairedBest.parsed.warnings.length) changed = true;

  if (!changed) return repairedBest;
  return {
    ...repairedBest,
    parsed: {
      ...repairedBest.parsed,
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
