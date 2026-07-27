import type {
  ParsedReceipt,
  ParsedReceiptItem,
  ReceiptParserDiagnostics,
  ReceiptRetailer,
} from "./types";

const retailerProfiles: Array<{
  key: ReceiptRetailer;
  displayName: string;
  markers: RegExp[];
}> = [
  { key: "coles", displayName: "Coles", markers: [/\bcoles\b/i, /coles supermarkets/i] },
  { key: "woolworths", displayName: "Woolworths", markers: [/\bwoolworths\b/i, /woolworths group/i] },
  { key: "aldi", displayName: "ALDI", markers: [/\baldi\b/i] },
  { key: "iga", displayName: "IGA", markers: [/\biga\b/i] },
  { key: "drakes", displayName: "Drakes", markers: [/\bdrakes\b/i] },
  { key: "costco", displayName: "Costco", markers: [/\bcostco\b/i] },
];

const hardStopMarkers = [
  /^\s*(?:payment|payments?)\b/i,
  /^\s*eft\b/i,
  /\bcredit\s+account\b/i,
  /\bdebit\s+account\b/i,
  /\beftpos\b/i,
  /\bnab\s+visa\b/i,
  /\bvisa\b/i,
  /\bmastercard\b/i,
  /\bapproved\b/i,
  /\bauth(?:orisation|orization)?\b/i,
  /\brrn\b/i,
  /\bterminal\b/i,
  /\bcard\s*(?:no|number)\b/i,
];

const ignoredMarkers = [
  /^\s*(?:subtotal|sub-total|grand\s+total|amount\s+due)\b/i,
  /^\s*(?:gst|tax|change|cash|tendered)\b/i,
  /^\s*(?:saving|savings|you\s+saved)\b/i,
  /^\s*(?:receipt|invoice|tax\s+invoice)\b/i,
  /^\s*(?:abn|store|served\s+by|operator|register|date|time)\b/i,
  /^\s*(?:thank\s+you|www\.|tel\b|phone\b|flybuys\b|everyday\s+rewards\b)/i,
  /^[-_=*\s]+$/,
];

const totalSummaryMarker = /^\s*(?:grand\s+total|amount\s+due|total\s+for\s+\d+\s+items?|total)\b/i;
const taxOrSavingsMarker = /\b(?:gst|tax|saving|savings|discount|change)\b/i;
const promotionMarker = /\b(?:for\s*\$?\d+|special|promo|promotion|multibuy|multi-buy|save)\b/i;
const moneyPattern = /-?\$?\s*\d+[.,]\d{2}\b/g;

type ParsedAdjustment = {
  amount: number;
  sourceText: string;
};

function normaliseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|{}]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function detectRetailer(text: string) {
  for (const profile of retailerProfiles) {
    if (profile.markers.some((marker) => marker.test(text))) {
      return { retailer: profile.displayName, retailerKey: profile.key };
    }
  }

  return { retailer: null, retailerKey: "generic" as const };
}

function detectDate(text: string) {
  const match = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (!match) return null;

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const candidate = `${year}-${month}-${day}`;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : candidate;
}

function parseMoney(value: string) {
  const normalised = value.replace(/\s/g, "").replace("$", "").replace(",", ".");
  const amount = Number(normalised);
  return Number.isFinite(amount) ? amount : null;
}

function extractLastMoney(line: string) {
  const matches = [...line.matchAll(moneyPattern)];
  const match = matches.at(-1);
  return match ? parseMoney(match[0]) : null;
}

function detectTotal(lines: string[]) {
  const priorities = [
    /^\s*total\s+for\s+\d+\s+items?\b/i,
    /^\s*grand\s+total\b/i,
    /^\s*amount\s+due\b/i,
    /^\s*total\b/i,
  ];

  for (const marker of priorities) {
    for (const line of lines) {
      if (!marker.test(line) || taxOrSavingsMarker.test(line)) continue;
      const value = extractLastMoney(line);
      if (value !== null && value >= 0) return { total: value, totalLine: line };
    }
  }

  return { total: null, totalLine: null };
}

function detectExpectedItemCount(lines: string[]) {
  const summary = lines.find((line) => /^\s*total\s+for\s+\d+\s+items?\b/i.test(line));
  const match = summary?.match(/^\s*total\s+for\s+(\d+)\s+items?\b/i);
  return match ? Number(match[1]) : null;
}

function containsHardStop(line: string) {
  return hardStopMarkers.some((marker) => marker.test(line));
}

function shouldIgnore(line: string) {
  return ignoredMarkers.some((marker) => marker.test(line));
}

function cleanDescription(value: string) {
  return value
    .replace(/^\d+(?:\.\d+)?\s*[xX]\s*/, "")
    .replace(/^[*%#~]+\s*/, "")
    .replace(/^[xX]\s+(?=[\p{L}\p{N}])/u, "")
    .replace(/[^\p{L}\p{N}&'()\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productCandidateFromSegment(descriptionText: string, amountText: string, sourceText: string): ParsedReceiptItem | null {
  const amount = parseMoney(amountText);
  if (amount === null || amount < 0) return null;

  const quantityMatch = descriptionText.match(/^(\d+(?:\.\d+)?)\s*[xX]\s*/);
  const description = cleanDescription(descriptionText);

  if (description.length < 2 || !/[a-z]/i.test(description)) return null;
  if (containsHardStop(description) || shouldIgnore(description) || totalSummaryMarker.test(description)) return null;
  if (promotionMarker.test(description)) return null;

  return {
    description,
    quantity: quantityMatch ? Number(quantityMatch[1]) : 1,
    price: amount,
    sourceText,
    confidence: 92,
  };
}

function splitPricedSegments(line: string) {
  const matches = [...line.matchAll(moneyPattern)];
  if (matches.length === 0) return { items: [] as ParsedReceiptItem[], adjustments: [] as ParsedAdjustment[] };

  const items: ParsedReceiptItem[] = [];
  const adjustments: ParsedAdjustment[] = [];
  let cursor = 0;

  for (const match of matches) {
    const index = match.index ?? 0;
    const descriptionText = line.slice(cursor, index).trim();
    const amountText = match[0];
    const amount = parseMoney(amountText);
    cursor = index + amountText.length;

    if (amount === null) continue;

    const isAdjustment = amount < 0 || promotionMarker.test(descriptionText);
    if (isAdjustment) {
      if (amount !== 0) adjustments.push({ amount, sourceText: `${descriptionText} ${amountText}`.trim() });
      continue;
    }

    const item = productCandidateFromSegment(descriptionText, amountText, line);
    if (item) items.push(item);
  }

  return { items, adjustments };
}

function locateItemSection(lines: string[]) {
  const descriptionIndex = lines.findIndex((line) => /^\s*description\b/i.test(line));
  const startIndex = descriptionIndex >= 0 ? descriptionIndex + 1 : 0;
  let endIndex = lines.length;
  let paymentStartLine: string | null = null;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (containsHardStop(line)) {
      endIndex = index;
      paymentStartLine = line;
      break;
    }
    if (totalSummaryMarker.test(line) && !taxOrSavingsMarker.test(line)) {
      endIndex = index;
      break;
    }
  }

  return {
    descriptionIndex,
    startIndex,
    endIndex,
    itemSectionLines: lines.slice(startIndex, endIndex),
    paymentStartLine,
  };
}

function extractItems(lines: string[], total: number | null) {
  const section = locateItemSection(lines);
  const items: ParsedReceiptItem[] = [];
  const adjustments: ParsedAdjustment[] = [];
  let buffer = "";

  for (const line of section.itemSectionLines) {
    if (shouldIgnore(line) || containsHardStop(line)) {
      buffer = "";
      continue;
    }

    const direct = splitPricedSegments(line);
    if (direct.items.length > 0 || direct.adjustments.length > 0) {
      items.push(...direct.items);
      adjustments.push(...direct.adjustments);
      buffer = "";
      continue;
    }

    buffer = `${buffer} ${line}`.trim();
    const reconstructed = splitPricedSegments(buffer);
    if (reconstructed.items.length > 0 || reconstructed.adjustments.length > 0) {
      items.push(...reconstructed.items.map((item) => ({ ...item, confidence: 86 })));
      adjustments.push(...reconstructed.adjustments);
      buffer = "";
    } else if (buffer.length > 180) {
      buffer = line;
    }
  }

  if (items.length === 0 && total !== null && section.itemSectionLines.length > 0) {
    const summaryLine = lines.find((line) => /^\s*total\s+for\s+1\s+item\b/i.test(line));
    if (summaryLine) {
      const possibleDescription = section.itemSectionLines
        .filter((line) => !shouldIgnore(line) && !containsHardStop(line))
        .map((line) => line.replace(moneyPattern, "").trim())
        .map(cleanDescription)
        .filter((line) => line.length >= 3 && /[a-z]/i.test(line))
        .sort((a, b) => b.length - a.length)[0];

      if (possibleDescription) {
        items.push({
          description: possibleDescription,
          quantity: 1,
          price: total,
          sourceText: possibleDescription,
          confidence: 72,
        });
      }
    }
  }

  return { items: items.slice(0, 100), adjustments, section };
}

function calculateAdjustedTotal(items: ParsedReceiptItem[], adjustments: ParsedAdjustment[]) {
  const itemsTotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const adjustmentTotal = adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
  return Math.round((itemsTotal + adjustmentTotal) * 100) / 100;
}

function resolveTotal(
  detectedTotal: number | null,
  items: ParsedReceiptItem[],
  adjustments: ParsedAdjustment[],
  expectedItemCount: number | null,
) {
  const calculatedTotal = calculateAdjustedTotal(items, adjustments);
  const hasCompleteItemCount = expectedItemCount !== null && items.length === expectedItemCount;
  const hasPromotion = adjustments.some((adjustment) => adjustment.amount < 0);

  if (hasCompleteItemCount && hasPromotion && calculatedTotal >= 0) {
    if (detectedTotal === null || Math.abs(detectedTotal - calculatedTotal) > 0.05) {
      return { total: calculatedTotal, corrected: true };
    }
  }

  return { total: detectedTotal, corrected: false };
}

function validateTotal(items: ParsedReceiptItem[], adjustments: ParsedAdjustment[], total: number | null) {
  if (total === null || items.length === 0) return [];

  const calculatedTotal = calculateAdjustedTotal(items, adjustments);
  const difference = Math.abs(calculatedTotal - total);

  return difference > 0.05
    ? [`Detected purchases and promotions total $${calculatedTotal.toFixed(2)}, which differs from the receipt total of $${total.toFixed(2)}.`]
    : [];
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = normaliseLines(text);
  const { retailer, retailerKey } = detectRetailer(text);
  const purchasedAt = detectDate(text);
  const { total: detectedTotal, totalLine } = detectTotal(lines);
  const expectedItemCount = detectExpectedItemCount(lines);
  const { items, adjustments, section } = extractItems(lines, detectedTotal);
  const resolved = resolveTotal(detectedTotal, items, adjustments, expectedItemCount);
  const warnings = validateTotal(items, adjustments, resolved.total);

  if (resolved.corrected && detectedTotal !== null) {
    warnings.unshift(`Receipt total was reconciled from $${detectedTotal.toFixed(2)} to $${resolved.total?.toFixed(2)} using ${items.length} items and promotion adjustments.`);
  }

  if (expectedItemCount !== null && items.length !== expectedItemCount) {
    warnings.unshift(`Receipt says ${expectedItemCount} items, but ${items.length} purchase lines were detected.`);
  }

  const confidenceParts = [
    retailer ? 1 : 0,
    purchasedAt ? 1 : 0,
    resolved.total !== null ? 1 : 0,
    items.length > 0 ? 1 : 0,
    expectedItemCount === null || items.length === expectedItemCount ? 1 : 0,
  ];

  const diagnostics: ReceiptParserDiagnostics = {
    normalisedLines: lines,
    itemSectionLines: section.itemSectionLines,
    totalLine,
    paymentStartLine: section.paymentStartLine,
  };

  return {
    retailer,
    retailerKey,
    purchasedAt,
    total: resolved.total,
    items,
    warnings,
    diagnostics,
    confidence: Math.round((confidenceParts.reduce((sum, value) => sum + value, 0) / confidenceParts.length) * 100),
  };
}
