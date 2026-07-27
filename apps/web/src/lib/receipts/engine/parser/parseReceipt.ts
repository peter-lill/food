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

function extractLastMoney(line: string) {
  const matches = [...line.matchAll(/\$?\s*(\d+[.,]\d{2})\b/g)];
  const match = matches.at(-1);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
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
      if (value !== null) return { total: value, totalLine: line };
    }
  }

  return { total: null, totalLine: null };
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
    .replace(/[^\p{L}\p{N}&'()\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productCandidateFromLine(line: string): ParsedReceiptItem | null {
  if (containsHardStop(line) || shouldIgnore(line) || totalSummaryMarker.test(line)) return null;

  const match = line.match(/^(.*?)(?:\s+|\s*\$)(\d+[.,]\d{2})\s*$/);
  if (!match) return null;

  const quantityMatch = match[1].match(/^(\d+(?:\.\d+)?)\s*[xX]\s*/);
  const description = cleanDescription(match[1]);

  if (description.length < 2 || !/[a-z]/i.test(description)) return null;
  if (containsHardStop(description) || shouldIgnore(description)) return null;

  const price = Number(match[2].replace(",", "."));
  if (!Number.isFinite(price) || price < 0) return null;

  return {
    description,
    quantity: quantityMatch ? Number(quantityMatch[1]) : 1,
    price,
    sourceText: line,
    confidence: 92,
  };
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
  let buffer = "";

  for (const line of section.itemSectionLines) {
    if (shouldIgnore(line) || containsHardStop(line)) {
      buffer = "";
      continue;
    }

    const direct = productCandidateFromLine(line);
    if (direct) {
      items.push(direct);
      buffer = "";
      continue;
    }

    buffer = `${buffer} ${line}`.trim();
    const reconstructed = productCandidateFromLine(buffer);
    if (reconstructed) {
      items.push({ ...reconstructed, confidence: 86 });
      buffer = "";
    } else if (buffer.length > 140) {
      buffer = line;
    }
  }

  if (items.length === 0 && total !== null && section.itemSectionLines.length > 0) {
    const summaryLine = lines.find((line) => /^\s*total\s+for\s+1\s+item\b/i.test(line));
    if (summaryLine) {
      const possibleDescription = section.itemSectionLines
        .filter((line) => !shouldIgnore(line) && !containsHardStop(line))
        .map((line) => line.replace(/\$?\s*\d+[.,]\d{2}\s*$/, "").trim())
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

  return { items: items.slice(0, 100), section };
}

function validateTotal(items: ParsedReceiptItem[], total: number | null) {
  if (total === null || items.length === 0) return [];

  const itemTotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const difference = Math.abs(itemTotal - total);

  return difference > 0.05
    ? [`Detected line prices total $${itemTotal.toFixed(2)}, which differs from the receipt total of $${total.toFixed(2)}.`]
    : [];
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = normaliseLines(text);
  const { retailer, retailerKey } = detectRetailer(text);
  const purchasedAt = detectDate(text);
  const { total, totalLine } = detectTotal(lines);
  const { items, section } = extractItems(lines, total);
  const warnings = validateTotal(items, total);

  const confidenceParts = [
    retailer ? 1 : 0,
    purchasedAt ? 1 : 0,
    total !== null ? 1 : 0,
    items.length > 0 ? 1 : 0,
    warnings.length === 0 ? 1 : 0,
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
    total,
    items,
    warnings,
    diagnostics,
    confidence: Math.round((confidenceParts.reduce((sum, value) => sum + value, 0) / confidenceParts.length) * 100),
  };
}
