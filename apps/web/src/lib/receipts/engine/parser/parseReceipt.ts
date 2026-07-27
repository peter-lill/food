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
  {
    key: "woolworths",
    displayName: "Woolworths",
    markers: [
      /\bwoolworths\b/i,
      /woolworths group/i,
      /everyday rewards/i,
      /\bereceipt\b/i,
    ],
  },
  { key: "aldi", displayName: "ALDI", markers: [/\baldi\b/i, /aldi stores/i, /shopping at aldi/i] },
  { key: "iga", displayName: "IGA", markers: [/\biga\b/i] },
  { key: "drakes", displayName: "Drakes", markers: [/\bdrakes\b/i] },
  { key: "costco", displayName: "Costco", markers: [/\bcostco\b/i, /costco wholesale/i, /wholesale australia/i] },
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
  /\bcard\s*(?:no|number|sales)\b/i,
  /\bcustomer\s+copy\b/i,
  /\bcommonwealth\s+bank\b/i,
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

const totalSummaryMarker = /^\s*(?:grand\s+total|amount\s+due|total\s+for\s+\d+\s+items?|total\s*\(\s*\d+\s+items?\s*\)|total)\b/i;
const taxOrSavingsMarker = /\b(?:gst|tax|saving|savings|discount|change)\b/i;
const promotionMarker = /\b(?:for\s*\$?\d+|special|promo|promotion|multibuy|multi-buy|save)\b/i;
const moneyPattern = /-?\$?\s*\d+[.,]\d{2}\b/g;

interface ParsedAdjustment {
  amount: number;
  sourceText: string;
}

interface ParserResult {
  items: ParsedReceiptItem[];
  adjustments: ParsedAdjustment[];
  itemSectionLines: string[];
  paymentStartLine: string | null;
  expectedItemCount: number | null;
}

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
  const matches = [...text.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/g)];
  for (const match of matches) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const candidate = `${year}-${month}-${day}`;
    const parsed = new Date(`${candidate}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return candidate;
  }
  return null;
}

function parseMoney(value: string) {
  const normalised = value.replace(/\s/g, "").replace("$", "").replace(",", ".");
  const amount = Number(normalised);
  return Number.isFinite(amount) ? amount : null;
}

function extractMoneyValues(line: string) {
  return [...line.matchAll(moneyPattern)]
    .map((match) => parseMoney(match[0]))
    .filter((amount): amount is number => amount !== null);
}

function extractLastMoney(line: string) {
  return extractMoneyValues(line).at(-1) ?? null;
}

function detectTotal(lines: string[], retailerKey: ReceiptRetailer) {
  const priorities = retailerKey === "aldi"
    ? [/^\s*total\s*\(?incl\.?\s*gst\)?\b/i, /^\s*total\b/i]
    : retailerKey === "woolworths"
      ? [/^\s*total\s*\(\s*\d+\s+items?\s*\)/i, /^\s*total\b/i, /^\s*amount\s+due\b/i]
      : [
          /^\s*total\s+for\s+\d+\s+items?\b/i,
          /^\s*grand\s+total\b/i,
          /^\s*amount\s+due\b/i,
          /^\s*total\b/i,
        ];

  for (const marker of priorities) {
    for (const line of lines) {
      if (!marker.test(line)) continue;
      if (retailerKey !== "aldi" && /gst\s*$/i.test(line)) continue;
      if (/surcharge|savings|discount|change/i.test(line)) continue;
      const value = extractLastMoney(line);
      if (value !== null && value >= 0) return { total: value, totalLine: line };
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
    .replace(/^[*%^#~]+\s*/, "")
    .replace(/^[xX]\s+(?=[\p{L}\p{N}])/u, "")
    .replace(/[^\p{L}\p{N}&'()\-\/\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeItem(
  description: string,
  quantity: number,
  price: number,
  sourceText: string,
  confidence: number,
): ParsedReceiptItem | null {
  const cleaned = cleanDescription(description);
  if (cleaned.length < 2 || !/[a-z]/i.test(cleaned)) return null;
  if (containsHardStop(cleaned) || shouldIgnore(cleaned) || totalSummaryMarker.test(cleaned)) return null;
  return { description: cleaned, quantity, price, sourceText, confidence };
}

function expectedCountFromLines(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/(?:total\s*)?\(?\s*(\d+)\s+items?\s*\)?/i);
    if (match && /total|items/i.test(line)) return Number(match[1]);
  }
  return null;
}

function parseWoolworths(lines: string[]): ParserResult {
  const items: ParsedReceiptItem[] = [];
  const itemSectionLines: string[] = [];
  let paymentStartLine: string | null = null;
  let pendingDescription = "";
  let started = false;
  let inItems = false;

  const quantityPattern = /\bqty\s+(\d+(?:\.\d+)?)\s*@\s*\$?\s*(\d+[.,]\d{2})\s*(?:each|ea\.?)?/i;

  for (const line of lines) {
    if (/^\s*description\b/i.test(line)) {
      inItems = true;
      continue;
    }

    if (!inItems) continue;

    if (totalSummaryMarker.test(line) || containsHardStop(line)) {
      if (containsHardStop(line)) paymentStartLine = line;
      break;
    }

    if (/^\s*\^?promotional\s+price\b/i.test(line) || /^\s*#?total\s+includes\s+gst\b/i.test(line)) {
      continue;
    }

    const quantityMatch = line.match(quantityPattern);
    if (quantityMatch) {
      const quantity = Number(quantityMatch[1]);
      const unitPrice = parseMoney(quantityMatch[2]);
      const moneyValues = extractMoneyValues(line);
      const calculatedLineTotal = unitPrice === null ? null : Math.round(quantity * unitPrice * 100) / 100;
      const printedLineTotal = moneyValues.length > 1 ? moneyValues.at(-1) ?? null : null;
      const lineTotal = printedLineTotal ?? calculatedLineTotal;
      const qtyIndex = quantityMatch.index ?? 0;
      const inlineDescription = cleanDescription(line.slice(0, qtyIndex));

      if (inlineDescription && lineTotal !== null) {
        const item = makeItem(inlineDescription, quantity, lineTotal, line, 98);
        if (item) items.push(item);
      } else if (pendingDescription && lineTotal !== null) {
        const item = makeItem(pendingDescription, quantity, lineTotal, `${pendingDescription} | ${line}`, 98);
        if (item) items.push(item);
        pendingDescription = "";
      } else {
        const previous = items.at(-1);
        if (previous && lineTotal !== null) {
          previous.quantity = quantity;
          previous.price = lineTotal;
          previous.sourceText = `${previous.sourceText} | ${line}`;
          previous.confidence = 98;
        }
      }

      itemSectionLines.push(line);
      started = true;
      continue;
    }

    const amounts = extractMoneyValues(line);
    if (amounts.length > 0) {
      const lineTotal = amounts.at(-1) ?? null;
      const lastMoneyMatch = [...line.matchAll(moneyPattern)].at(-1);
      const beforeAmount = lastMoneyMatch?.index === undefined ? line : line.slice(0, lastMoneyMatch.index);
      const description = cleanDescription(beforeAmount || pendingDescription);

      if (lineTotal !== null && description && !/^qty\b/i.test(description)) {
        const item = makeItem(description, 1, lineTotal, line, 96);
        if (item) {
          items.push(item);
          itemSectionLines.push(line);
          pendingDescription = "";
          started = true;
        }
      }
      continue;
    }

    if (!shouldIgnore(line) && !promotionMarker.test(line) && /[a-z]/i.test(line)) {
      pendingDescription = cleanDescription(line);
      itemSectionLines.push(line);
    }
  }

  return {
    items,
    adjustments: [],
    itemSectionLines,
    paymentStartLine,
    expectedItemCount: expectedCountFromLines(lines),
  };
}

function parseAldi(lines: string[]): ParserResult {
  const items: ParsedReceiptItem[] = [];
  const itemSectionLines: string[] = [];
  let paymentStartLine: string | null = null;
  let started = false;

  const productPattern = /^(\d{5,8})\s+(.+?)\s+(\d+[.,]\d{2})\s+[A-Z]\s*$/i;
  const quantityPattern = /^\s*qty\s+(\d+(?:\.\d+)?)\s*@\s*\$?\s*(\d+[.,]\d{2})\s*ea\.?/i;

  for (const line of lines) {
    if (/^\s*subtotal\b/i.test(line) || /^\s*credit\s+surcharge\b/i.test(line) || /^\s*total\s*\(?incl/i.test(line)) {
      if (started) break;
      continue;
    }

    if (containsHardStop(line) && started) {
      paymentStartLine = line;
      break;
    }

    const productMatch = line.match(productPattern);
    if (productMatch) {
      const price = parseMoney(productMatch[3]);
      if (price !== null) {
        const item = makeItem(productMatch[2], 1, price, line, 96);
        if (item) {
          items.push(item);
          itemSectionLines.push(line);
          started = true;
        }
      }
      continue;
    }

    const quantityMatch = line.match(quantityPattern);
    if (quantityMatch && items.length > 0) {
      const quantity = Number(quantityMatch[1]);
      const unitPrice = parseMoney(quantityMatch[2]);
      const previous = items.at(-1);
      if (previous && Number.isFinite(quantity) && unitPrice !== null) {
        previous.quantity = quantity;
        previous.price = Math.round(quantity * unitPrice * 100) / 100;
        previous.sourceText = `${previous.sourceText} | ${line}`;
        previous.confidence = 98;
        itemSectionLines.push(line);
      }
    }
  }

  return {
    items,
    adjustments: [],
    itemSectionLines,
    paymentStartLine,
    expectedItemCount: expectedCountFromLines(lines),
  };
}

function isCostcoDescription(line: string) {
  if (line.length < 3 || !/[a-z]/i.test(line)) return false;
  if (containsHardStop(line) || shouldIgnore(line)) return false;
  if (/costco|wholesale|wood street|phone|abn|tax invoice|exec goldstar|member|cashier/i.test(line)) return false;
  if (/^\d/.test(line)) return false;
  return true;
}

function parseCostco(lines: string[]): ParserResult {
  const items: ParsedReceiptItem[] = [];
  const adjustments: ParsedAdjustment[] = [];
  const itemSectionLines: string[] = [];
  let paymentStartLine: string | null = null;
  let pendingDescription = "";
  let started = false;

  const itemPattern = /^(\d{4,8})\s+(\d+(?:\.\d+)?)\s*[xX]\s+(-?\$?\s*\d+[.,]\d{2})(?:\s+(-?\$?\s*\d+[.,]\d{2})\s*[-&A-Z]*)?\s*$/i;

  for (const line of lines) {
    if (containsHardStop(line)) {
      if (started) {
        paymentStartLine = line;
        break;
      }
      continue;
    }

    const match = line.match(itemPattern);
    if (match) {
      const quantity = Number(match[2]);
      const firstAmount = parseMoney(match[3]);
      const repeatedAmount = match[4] ? parseMoney(match[4]) : null;
      const amount = repeatedAmount ?? firstAmount;
      const negative = /-\s*[&A-Z]*\s*$/i.test(line) || (amount !== null && amount < 0);

      if (amount !== null && negative) {
        adjustments.push({ amount: -Math.abs(amount), sourceText: line });
        pendingDescription = "";
        started = true;
        itemSectionLines.push(line);
        continue;
      }

      if (amount !== null && pendingDescription) {
        const item = makeItem(pendingDescription, quantity, amount, `${pendingDescription} | ${line}`, 94);
        if (item) {
          items.push(item);
          itemSectionLines.push(pendingDescription, line);
          started = true;
        }
      }
      pendingDescription = "";
      continue;
    }

    if (isCostcoDescription(line)) {
      pendingDescription = pendingDescription ? `${pendingDescription} ${line}` : line;
      if (pendingDescription.length > 100) pendingDescription = line;
    }
  }

  return { items, adjustments, itemSectionLines, paymentStartLine, expectedItemCount: null };
}

function productCandidateFromSegment(descriptionText: string, amountText: string, sourceText: string) {
  const amount = parseMoney(amountText);
  if (amount === null || amount < 0) return null;
  const quantityMatch = descriptionText.match(/^(\d+(?:\.\d+)?)\s*[xX]\s*/);
  const description = cleanDescription(descriptionText);
  if (promotionMarker.test(description)) return null;
  return makeItem(description, quantityMatch ? Number(quantityMatch[1]) : 1, amount, sourceText, 92);
}

function splitPricedSegments(line: string) {
  const matches = [...line.matchAll(moneyPattern)];
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
    if (amount < 0 || promotionMarker.test(descriptionText)) {
      if (amount !== 0) adjustments.push({ amount, sourceText: `${descriptionText} ${amountText}`.trim() });
      continue;
    }
    const item = productCandidateFromSegment(descriptionText, amountText, line);
    if (item) items.push(item);
  }

  return { items, adjustments };
}

function parseGeneric(lines: string[], detectedTotal: number | null): ParserResult {
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

  const itemSectionLines = lines.slice(startIndex, endIndex);
  const items: ParsedReceiptItem[] = [];
  const adjustments: ParsedAdjustment[] = [];
  let buffer = "";

  for (const line of itemSectionLines) {
    if (shouldIgnore(line) || containsHardStop(line)) {
      buffer = "";
      continue;
    }

    const direct = splitPricedSegments(line);
    if (direct.items.length || direct.adjustments.length) {
      items.push(...direct.items);
      adjustments.push(...direct.adjustments);
      buffer = "";
      continue;
    }

    buffer = `${buffer} ${line}`.trim();
    const rebuilt = splitPricedSegments(buffer);
    if (rebuilt.items.length || rebuilt.adjustments.length) {
      items.push(...rebuilt.items.map((item) => ({ ...item, confidence: 86 })));
      adjustments.push(...rebuilt.adjustments);
      buffer = "";
    } else if (buffer.length > 180) {
      buffer = line;
    }
  }

  if (items.length === 0 && detectedTotal !== null) {
    const summary = lines.find((line) => /^\s*total\s+for\s+1\s+item\b/i.test(line));
    if (summary) {
      const description = itemSectionLines
        .map((line) => cleanDescription(line.replace(moneyPattern, "")))
        .filter((line) => line.length >= 3 && /[a-z]/i.test(line))
        .sort((left, right) => right.length - left.length)[0];
      if (description) {
        const item = makeItem(description, 1, detectedTotal, description, 72);
        if (item) items.push(item);
      }
    }
  }

  return {
    items: items.slice(0, 100),
    adjustments,
    itemSectionLines,
    paymentStartLine,
    expectedItemCount: expectedCountFromLines(lines),
  };
}

function calculateAdjustedTotal(items: ParsedReceiptItem[], adjustments: ParsedAdjustment[]) {
  const itemTotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const adjustmentTotal = adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
  return Math.round((itemTotal + adjustmentTotal) * 100) / 100;
}

function validateTotal(items: ParsedReceiptItem[], adjustments: ParsedAdjustment[], total: number | null) {
  if (total === null || items.length === 0) return [];
  const calculated = calculateAdjustedTotal(items, adjustments);
  return Math.abs(calculated - total) > 0.05
    ? [`Detected purchases and adjustments total $${calculated.toFixed(2)}, which differs from the receipt total of $${total.toFixed(2)}.`]
    : [];
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = normaliseLines(text);
  const { retailer, retailerKey } = detectRetailer(text);
  const purchasedAt = detectDate(text);
  const { total: detectedTotal, totalLine } = detectTotal(lines, retailerKey);

  const parsed = retailerKey === "woolworths"
    ? parseWoolworths(lines)
    : retailerKey === "aldi"
      ? parseAldi(lines)
      : retailerKey === "costco"
        ? parseCostco(lines)
        : parseGeneric(lines, detectedTotal);

  let total = detectedTotal;
  const calculated = calculateAdjustedTotal(parsed.items, parsed.adjustments);
  if (total === null && parsed.items.length > 0) total = calculated;

  const warnings = validateTotal(parsed.items, parsed.adjustments, total);
  if (parsed.expectedItemCount !== null) {
    const unitCount = parsed.items.reduce((sum, item) => sum + item.quantity, 0);
    if (Math.abs(unitCount - parsed.expectedItemCount) > 0.001) {
      warnings.unshift(`Receipt reports ${parsed.expectedItemCount} items, but ${unitCount} units were detected.`);
    }
  }

  const diagnostics: ReceiptParserDiagnostics = {
    normalisedLines: lines,
    itemSectionLines: parsed.itemSectionLines,
    totalLine,
    paymentStartLine: parsed.paymentStartLine,
  };

  const confidenceParts = [
    retailer ? 1 : 0,
    purchasedAt ? 1 : 0,
    total !== null ? 1 : 0,
    parsed.items.length > 0 ? 1 : 0,
    warnings.length === 0 ? 1 : 0,
  ];

  return {
    retailer,
    retailerKey,
    purchasedAt,
    total,
    items: parsed.items,
    warnings,
    diagnostics,
    confidence: Math.round((confidenceParts.reduce((sum, value) => sum + value, 0) / confidenceParts.length) * 100),
  };
}
