import { genericProfile, retailerProfiles } from "./profiles";
import type { ParsedReceipt, ParsedReceiptItem, RetailerProfile } from "./types";

const priceAtEnd = /(?:\$\s*)?(\d{1,6}[.,]\d{2})\s*$/;
const quantityAtStart = /^\s*(\d+(?:[.,]\d+)?)\s*[xX]\s*/;

function normaliseLine(line: string) {
  return line
    .replace(/[|{}]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(normaliseLine)
    .filter(Boolean);
}

function matchesAny(line: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(line));
}

function detectProfile(lines: string[]): RetailerProfile {
  return retailerProfiles.find((profile) => lines.some((line) => matchesAny(line, profile.retailerMarkers))) ?? genericProfile;
}

function inferDate(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
    if (!match) continue;
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return null;
}

function inferTotal(lines: string[]) {
  const totalCandidates = lines.filter((line) => /\b(?:grand\s+total|amount\s+due|total)\b/i.test(line));
  for (const line of [...totalCandidates].reverse()) {
    const match = line.match(priceAtEnd) ?? line.match(/\$\s*(\d{1,6}[.,]\d{2})\b/);
    if (match) return Number(match[1].replace(",", "."));
  }
  return null;
}

function findItemBounds(lines: string[], profile: RetailerProfile) {
  const explicitStart = lines.findIndex((line) => matchesAny(line, profile.itemStartMarkers));
  const start = explicitStart >= 0 ? explicitStart + 1 : 0;

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (matchesAny(line, profile.paymentMarkers) || matchesAny(line, profile.itemEndMarkers)) {
      return { start, end: index };
    }
  }

  return { start, end: lines.length };
}

function rebuildWrappedLines(lines: string[], profile: RetailerProfile) {
  const rebuilt: string[] = [];
  let buffer = "";

  for (const line of lines) {
    if (matchesAny(line, profile.paymentMarkers)) break;
    if (matchesAny(line, profile.ignoredMarkers) || matchesAny(line, profile.itemStartMarkers)) {
      buffer = "";
      continue;
    }

    buffer = `${buffer} ${line}`.trim();
    if (priceAtEnd.test(buffer)) {
      rebuilt.push(buffer);
      buffer = "";
      continue;
    }

    if (buffer.length > 140) buffer = line;
  }

  return rebuilt;
}

function parseProductLine(line: string, profile: RetailerProfile): ParsedReceiptItem | null {
  if (matchesAny(line, profile.paymentMarkers) || matchesAny(line, profile.ignoredMarkers)) return null;

  const match = line.match(/^(.*?)(?:\s+|\s*\$)(\d{1,6}[.,]\d{2})\s*$/);
  if (!match) return null;

  const quantityMatch = match[1].match(quantityAtStart);
  const quantity = quantityMatch ? Number(quantityMatch[1].replace(",", ".")) : 1;
  const description = match[1]
    .replace(quantityAtStart, "")
    .replace(/^[*%#]+\s*/, "")
    .replace(/[^\p{L}\p{N}&'()\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (description.length < 2 || !/[a-z]/i.test(description)) return null;
  if (matchesAny(description, profile.paymentMarkers)) return null;

  const price = Number(match[2].replace(",", "."));
  if (!Number.isFinite(price) || price < 0) return null;

  return {
    description,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    price,
    sourceText: line,
    confidence: profile.key === "generic" ? 70 : 86,
  };
}

function validate(items: ParsedReceiptItem[], total: number | null) {
  const warnings: string[] = [];
  if (items.length === 0) warnings.push("No purchase lines were confidently detected.");

  if (total !== null && items.every((item) => item.price !== null)) {
    const itemTotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
    const difference = Math.abs(itemTotal - total);
    if (difference > 0.05) {
      warnings.push(`Detected line prices total $${itemTotal.toFixed(2)}, which differs from the receipt total by $${difference.toFixed(2)}.`);
    }
  }

  return warnings;
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = normaliseLines(text);
  const profile = detectProfile(lines);
  const { start, end } = findItemBounds(lines, profile);
  const itemLines = rebuildWrappedLines(lines.slice(start, end), profile);
  const items = itemLines
    .map((line) => parseProductLine(line, profile))
    .filter((item): item is ParsedReceiptItem => Boolean(item))
    .slice(0, 100);
  const total = inferTotal(lines);
  const warnings = validate(items, total);

  return {
    retailer: profile.key === "generic" ? null : profile.displayName,
    retailerKey: profile.key,
    purchasedAt: inferDate(lines),
    total,
    items,
    warnings,
    confidence: items.length === 0 ? 0 : Math.max(0, Math.round(items.reduce((sum, item) => sum + item.confidence, 0) / items.length - warnings.length * 8)),
  };
}
