import type {
  ParsedReceipt,
  ParsedReceiptItem,
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
  /^\s*(?:subtotal|sub-total|total|grand\s+total|amount\s+due)\b/i,
  /^\s*(?:gst|tax|change|cash|tendered)\b/i,
  /^\s*(?:saving|savings|you\s+saved)\b/i,
  /^\s*(?:receipt|invoice|tax\s+invoice)\b/i,
  /^\s*(?:abn|store|served\s+by|operator|register|date|time)\b/i,
  /^\s*(?:thank\s+you|www\.|tel\b|phone\b|flybuys\b|everyday\s+rewards\b)/i,
  /^[-_=*\s]+$/,
];

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

function detectTotal(lines: string[]) {
  const totalMarkers = /\b(?:grand\s+total|amount\s+due|total(?:\s+for\s+\d+\s+items?)?)\b/i;

  for (const line of [...lines].reverse()) {
    if (!totalMarkers.test(line)) continue;
    const prices = [...line.matchAll(/\$?\s*(\d+[.,]\d{2})\b/g)];
    const match = prices.at(-1);
    if (match) return Number(match[1].replace(",", "."));
  }

  return null;
}

function containsHardStop(line: string) {
  return hardStopMarkers.some((marker) => marker.test(line));
}

function shouldIgnore(line: string) {
  return ignoredMarkers.some((marker) => marker.test(line));
}

function productCandidateFromLine(line: string): ParsedReceiptItem | null {
  if (containsHardStop(line) || shouldIgnore(line)) return null;

  const match = line.match(/^(.*?)(?:\s+|\s*\$)(\d+[.,]\d{2})\s*$/);
  if (!match) return null;

  const quantityMatch = match[1].match(/^(\d+(?:\.\d+)?)\s*[xX]\s*/);
  const description = match[1]
    .replace(/^\d+(?:\.\d+)?\s*[xX]\s*/, "")
    .replace(/^[*%#]+\s*/, "")
    .replace(/[^\p{L}\p{N}&'()\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (description.length < 2 || !/[a-z]/i.test(description)) return null;
  if (containsHardStop(description) || shouldIgnore(description)) return null;

  const price = Number(match[2].replace(",", "."));
  if (!Number.isFinite(price) || price < 0) return null;

  return {
    description,
    quantity: quantityMatch ? Number(quantityMatch[1]) : 1,
    price,
    sourceText: line,
    confidence: 90,
  };
}

function extractItems(lines: string[]) {
  const items: ParsedReceiptItem[] = [];
  let buffer = "";
  let started = false;

  for (const line of lines) {
    if (containsHardStop(line)) break;

    if (/^\s*description\b/i.test(line)) {
      started = true;
      buffer = "";
      continue;
    }

    if (shouldIgnore(line)) {
      if (/^\s*(?:subtotal|total|grand\s+total|amount\s+due)\b/i.test(line) && started) {
        break;
      }
      buffer = "";
      continue;
    }

    const candidate = productCandidateFromLine(line);
    if (candidate) {
      items.push(candidate);
      started = true;
      buffer = "";
      continue;
    }

    buffer = `${buffer} ${line}`.trim();
    const reconstructed = productCandidateFromLine(buffer);
    if (reconstructed) {
      items.push(reconstructed);
      started = true;
      buffer = "";
    } else if (buffer.length > 120) {
      buffer = line;
    }
  }

  return items.slice(0, 100);
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
  const total = detectTotal(lines);
  const items = extractItems(lines);
  const warnings = validateTotal(items, total);

  const confidenceParts = [
    retailer ? 1 : 0,
    purchasedAt ? 1 : 0,
    total !== null ? 1 : 0,
    items.length > 0 ? 1 : 0,
    warnings.length === 0 ? 1 : 0,
  ];

  return {
    retailer,
    retailerKey,
    purchasedAt,
    total,
    items,
    warnings,
    confidence: Math.round((confidenceParts.reduce((sum, value) => sum + value, 0) / confidenceParts.length) * 100),
  };
}
