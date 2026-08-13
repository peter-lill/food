import { parseReceipt as parseBaseReceipt } from "./parseReceipt";
import type { ParsedReceipt, ParsedReceiptItem, ReceiptParserDiagnostics } from "./types";
import { classifyReceiptLines, type ReceiptOcrLine } from "../../receipt-structure";
import { hasRetailerIdentity } from "../../receipt-retailer-identity";

const moneyPattern = /-?\$?\s*\d+[.,]\d{2}\b/g;
const paymentMarker = /^(?:payment|payments?|eft|eftpos|visa|mastercard|merch\s+id|card|purchase|change)\b/i;
const headerMarker = /^(?:woolworths|the fresh food people|coles supermarkets|tax invoice|abn|store|store manager|phone|served by|register|receipt|date|time|pos\b|description\b|price\b)/i;
const summaryMarker = /^(?:(?:\d+\s+)?subtotal|(?:grand\s+)?total\b|gst\b|total includes gst|you saved|saving|savings)/i;
const promotionMarker = /\b(?:special|promo(?:tional)?|save|redeemed\s+free|\d+\s+for\s+\$?\d)|(?:for\s+\$?\d)/i;

function normaliseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|{}]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parseMoney(value: string) {
  const amount = Number(value.replace(/\s/g, "").replace("$", "").replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

function moneyValues(line: string) {
  return [...line.matchAll(moneyPattern)]
    .map((match) => parseMoney(match[0]))
    .filter((value): value is number => value !== null);
}

function cleanDescription(value: string) {
  return value
    .replace(/^[*%^#~<>=»«]+\s*/, "")
    // Coles prints tax/offer markers in a narrow left column. OCR commonly
    // turns those symbols into a lowercase x, sometimes joined to one extra
    // damaged capital (for example `xSVANILLA`). They are not product text.
    .replace(/^x(?:[A-Z](?=[A-Z]{3,})|\s+)(?=[A-Z])/, "")
    .replace(/[^\p{L}\p{N}&'()\-\/\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDate(text: string) {
  const candidates = text.split(/\r?\n/).flatMap((line, lineIndex) => {
    const matches = [...line.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/g)];
    return matches.map((match) => {
      const raw = match[0];
      const before = line.slice(0, match.index ?? 0);
      const labelled = /\bdate\s*[:\-]?\s*$/i.test(before);
      const beginsLine = line.trim().startsWith(raw);
      const score = (labelled ? 5 : 0) + (beginsLine ? 4 : 0) + (match[3].length === 4 ? 1 : 0);
      return { match, lineIndex, score };
    });
  });
  const best = candidates.sort((left, right) => right.score - left.score || right.lineIndex - left.lineIndex)[0];
  if (!best) return null;
  const [, dayValue, monthValue, yearValue] = best.match;
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue.length === 2 ? `20${yearValue}` : yearValue);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findReceiptTotal(lines: string[], recoverFromTender = false) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (recoverFromTender && /^(?:tal|[\[({]?[t7]?otal)\s+for\b/i.test(line)) {
      const following = lines.slice(index + 1, index + 6);
      const countOffset = following.findIndex((candidate) => /^\d+\s+(?:items?|[1il]tens?)[:;]?$/i.test(candidate));
      if (countOffset >= 0) {
        for (let offset = countOffset + 1; offset < following.length - 1; offset += 1) {
          const dollars = following[offset].match(/^\$\s*(\d{1,4})$/);
          const cents = following[offset + 1].match(/^(\d{2})$/);
          if (dollars && cents) {
            return {
              total: Number(`${dollars[1]}.${cents[1]}`),
              totalLine: [line, ...following.slice(0, offset + 2)].join(" | "),
              totalIndex: index,
            };
          }
        }
      }
    }
    const standaloneItemCount = /^\d+\s+items?:?$/i.test(line);
    if (standaloneItemCount) {
      const followingLines = lines.slice(index + 1, index + 3);
      const totalOffset = followingLines.findIndex((candidate) =>
        /^(?:total\s*)?\$?\s*\d+[.,]\d{2}$/i.test(candidate),
      );
      if (totalOffset >= 0) {
        const totalLine = followingLines[totalOffset];
        const total = moneyValues(totalLine).at(-1);
        if (total !== undefined) return { total, totalLine: `${line} | ${totalLine}`, totalIndex: index };
      }
    }
    if (!/^(?:grand\s+)?(?:total|[\[({]?otal)(?:\s+for\s+\d+\s+items?|\s*\(\s*\d+\s+items?\s*\))?\b/i.test(line)) continue;
    if (/^total includes gst/i.test(line)) continue;
    const sameLine = moneyValues(line).at(-1);
    if (sameLine !== undefined) return { total: sameLine, totalLine: line, totalIndex: index };

    const next = lines[index + 1];
    const nextValue = next ? moneyValues(next).at(-1) : undefined;
    if (nextValue !== undefined && !paymentMarker.test(next)) {
      return { total: nextValue, totalLine: `${line} | ${next}`, totalIndex: index };
    }
  }

  const paymentIndex = recoverFromTender ? lines.findIndex((line) => paymentMarker.test(line)) : -1;
  if (paymentIndex >= 0) {
    const paymentAmounts = lines
      .slice(paymentIndex, paymentIndex + 4)
      .filter((line) => paymentMarker.test(line))
      .flatMap(moneyValues)
      .filter((value) => value > 0);
    const tendered = Math.round(paymentAmounts.reduce((sum, value) => sum + value, 0) * 100) / 100;

    if (tendered > 0) {
      for (let index = paymentIndex - 1; index >= Math.max(0, paymentIndex - 6); index -= 1) {
        const candidate = moneyValues(lines[index]).at(-1);
        if (candidate !== undefined && candidate > 0 && Math.abs(candidate - tendered) <= 0.05) {
          return {
            total: candidate,
            totalLine: `${lines[index]} | reconciled from tender payments`,
            totalIndex: index,
          };
        }
      }
    }
  }
  return { total: null, totalLine: null, totalIndex: lines.length };
}

function expectedItemCount(lines: string[]) {
  for (const line of lines) {
    const explicit = line.match(/(?:total|[\[({]?otal)\s+(?:for\s+)?(\d+)\s+items?/i)
      ?? line.match(/^(\d+)\s+[1il]tens?[:;]?$/i)
      ?? line.match(/^(\d+)\s+items?:?$/i)
      ?? line.match(/(\d+)\s+subtotal\b/i);
    if (explicit) return Number(explicit[1]);
  }
  return null;
}

function itemSectionBounds(lines: string[], retailer: "coles" | "woolworths", totalIndex: number) {
  const descriptionIndex = lines.findIndex((line) => /^description\b/i.test(line));
  if (descriptionIndex >= 0) return { start: descriptionIndex + 1, end: totalIndex };

  if (retailer === "woolworths") {
    const transactionIndex = lines.findIndex((line) => /\bpos\b.*\btrans\b/i.test(line));
    if (transactionIndex >= 0) return { start: transactionIndex + 1, end: totalIndex };
  }

  const isPricedMerchandise = (line: string) => moneyValues(line).some((value) => value > 0)
    && /[a-z]{2,}/i.test(line)
    && !headerMarker.test(line)
    && !summaryMarker.test(line)
    && !paymentMarker.test(line)
    && !promotionMarker.test(line);

  // Split-digit repair can make ABN/header debris look like a price (for example
  // `89 70` -> `89.70`). Require merchandise continuity after the first priced row:
  // another priced product, a quantity row, or a promotion must follow nearby.
  const firstProductIndex = lines.findIndex((line, index) => {
    if (index >= totalIndex || !isPricedMerchandise(line)) return false;
    return lines.slice(index + 1, Math.min(totalIndex, index + 4)).some((candidate) =>
      isPricedMerchandise(candidate)
      || /^(?:qty\s+)?\d+(?:\.\d+)?\s*@/i.test(candidate)
      || promotionMarker.test(candidate));
  });
  if (firstProductIndex < 0) return { start: totalIndex, end: totalIndex };

  // A recognized table heading may have been removed by structural sanitising.
  // Preserve a small contiguous run of product-looking rows immediately before the
  // first priced product when OCR lost only their prices (Springwood litter/milk).
  let start = firstProductIndex;
  for (let index = firstProductIndex - 1; index >= Math.max(0, firstProductIndex - 3); index -= 1) {
    const candidate = lines[index];
    const hasPackShape = /\b\d+(?:\.\d+)?\s*(?:ml|l|litres?|liters?|g|grams?|kg|packs?)\b/i.test(candidate);
    if (!hasPackShape || !/[a-z]{3,}/i.test(candidate) || headerMarker.test(candidate) || summaryMarker.test(candidate)) break;
    start = index;
  }
  return { start, end: totalIndex };
}

function parsePhotoItems(lines: string[], start: number, end: number, receiptTotal: number | null) {
  const items: ParsedReceiptItem[] = [];
  const section = lines.slice(start, end);
  const adjustments: number[] = [];
  const rejectedPrices: number[] = [];
  let pendingDescription = "";
  const quantityPattern = /^(?:qty\s+)?(\d+(?:\.\d+)?)\s*@\s*\$?\s*(\d+[.,]\d{2})\s*(?:each|ea\.?)?(?:\s+(\d+[.,]\d{2}))?/i;
  const damagedQuantityPattern = /^(\d)\s*[0o@]\s*\$?\s*(\d+[.,]\d{1,2})\s*e/i;

  const flushPending = () => {
    if (!pendingDescription) return;
    items.push({ description: pendingDescription, quantity: 1, price: null, sourceText: pendingDescription, confidence: 72 });
    pendingDescription = "";
  };

  for (const line of section) {
    if (headerMarker.test(line) || summaryMarker.test(line) || paymentMarker.test(line)) {
      pendingDescription = "";
      continue;
    }

    const quantityMatch = line.match(quantityPattern) ?? line.match(damagedQuantityPattern);
    if (quantityMatch) {
      const quantity = Number(quantityMatch[1]);
      const unitPrice = parseMoney(quantityMatch[2]);
      const printedTotal = quantityMatch[3] ? parseMoney(quantityMatch[3]) : null;
      const calculatedTotal = unitPrice === null ? null : Math.round(quantity * unitPrice * 100) / 100;
      const previous = items.at(-1);
      const previousPrice = previous?.price ?? null;
      const damagedQuantity = !quantityPattern.test(line);
      // A damaged quantity row can retain only one unit-price decimal (`2O
      // $1.5 E`). When its calculated value is close to the already printed
      // product total, keep the printed total and use the row only as quantity
      // evidence.
      const lineTotal = printedTotal
        ?? (damagedQuantity && previousPrice !== null && calculatedTotal !== null && Math.abs(previousPrice - calculatedTotal) <= .15
          ? previousPrice
          : calculatedTotal);

      if (pendingDescription && lineTotal !== null) {
        items.push({ description: pendingDescription, quantity, price: lineTotal, sourceText: `${pendingDescription} | ${line}`, confidence: 98 });
      } else if (previous && Number.isFinite(quantity)) {
        previous.quantity = quantity;
        if (lineTotal !== null) previous.price = lineTotal;
        previous.sourceText = `${previous.sourceText} | ${line}`;
        previous.confidence = 98;
      }
      pendingDescription = "";
      continue;
    }

    const matches = [...line.matchAll(moneyPattern)];
    if (matches.length > 0) {
      const last = matches.at(-1)!;
      const amount = parseMoney(last[0]);
      const inlineDescription = cleanDescription(line.slice(0, last.index ?? 0));

      if (amount !== null && (amount < 0 || promotionMarker.test(line))) {
        if (amount < 0) adjustments.push(amount);
        else if (/redeemed\s+free/i.test(line)) adjustments.push(-amount);
        pendingDescription = "";
        continue;
      }

      const pendingHasPackShape = /\b\d+(?:\.\d+)?\s*(?:ml|l|litres?|liters?|g|grams?|kg|packs?)\b/i.test(pendingDescription);
      if (pendingDescription && inlineDescription && pendingHasPackShape) flushPending();
      // Wrapped descriptions can be split immediately before the priced part.
      // Join only a pack-less fragment; a fragment already containing its own
      // pack shape is a distinct product whose price was lost.
      const description = pendingDescription && inlineDescription
        ? `${pendingDescription} ${inlineDescription}`
        : inlineDescription || pendingDescription;
      if (amount !== null && amount >= 0 && description && !headerMarker.test(description)) {
        if (receiptTotal !== null && amount > receiptTotal * 2) {
          rejectedPrices.push(amount);
        } else {
          items.push({ description, quantity: 1, price: amount, sourceText: line, confidence: 96 });
        }
      }
      pendingDescription = "";
      continue;
    }

    const cleaned = cleanDescription(line);
    if (cleaned.length >= 4 && /[a-z]/i.test(cleaned) && !headerMarker.test(cleaned) && !promotionMarker.test(cleaned)) {
      flushPending();
      pendingDescription = cleaned;
    } else if (promotionMarker.test(cleaned)) {
      pendingDescription = "";
    }
  }

  flushPending();

  // A torn/faint price column may leave only `3 7` at the end of a product.
  // Recover it only from an identical price printed on another product; then
  // permit one cents-only OCR correction when that same repeated shelf price
  // makes the explicit receipt arithmetic balance.
  const pricedValues = items.flatMap((item) => item.price === null ? [] : [item.price]);
  for (const item of items.filter((entry) => entry.price === null)) {
    const fragment = item.description.match(/\s(\d+)\s+(\d)\s*$/);
    if (!fragment) continue;
    const prefix = `${fragment[1]}.${fragment[2]}`;
    const matches = [...new Set(pricedValues.filter((price) => price.toFixed(2).startsWith(prefix)))];
    const viable = matches.filter((candidate) => {
      const provisional = Math.round((items.reduce((sum, entry) => sum + (entry === item ? candidate : entry.price ?? 0), 0) + adjustments.reduce((sum, value) => sum + value, 0)) * 100) / 100;
      const difference = receiptTotal === null ? 0 : Math.round((receiptTotal - provisional) * 100) / 100;
      if (difference === 0) return true;
      if (Math.abs(difference) > .09) return false;
      return items.filter((entry) => entry !== item && entry.price !== null
        && pricedValues.includes(Math.round(((entry.price ?? 0) + difference) * 100) / 100)).length === 1;
    });
    if (viable.length !== 1) continue;
    item.price = viable[0];
    item.description = item.description.slice(0, fragment.index).trim();
    item.confidence = Math.min(item.confidence, 86);
  }

  if (receiptTotal !== null && items.every((item) => item.price !== null)) {
    const current = Math.round((items.reduce((sum, item) => sum + (item.price ?? 0), 0) + adjustments.reduce((sum, value) => sum + value, 0)) * 100) / 100;
    const difference = Math.round((receiptTotal - current) * 100) / 100;
    if (Math.abs(difference) > 0 && Math.abs(difference) <= .09) {
      const repairs = items.flatMap((item) => {
        const corrected = Math.round(((item.price ?? 0) + difference) * 100) / 100;
        return pricedValues.some((price) => price === corrected) ? [{ item, corrected }] : [];
      });
      if (repairs.length === 1) {
        repairs[0].item.price = repairs[0].corrected;
        repairs[0].item.confidence = Math.min(repairs[0].item.confidence, 86);
      }
    }
  }
  return { items, section, adjustments, rejectedPrices };
}

function parsePhotoReceipt(text: string, retailer: "Coles" | "Woolworths"): ParsedReceipt {
  const lines = normaliseLines(text);
  const retailerKey = retailer.toLowerCase() as "coles" | "woolworths";
  const { total, totalLine, totalIndex } = findReceiptTotal(lines, retailerKey === "coles");
  const bounds = itemSectionBounds(lines, retailerKey, totalIndex);
  const { items, section, adjustments, rejectedPrices } = parsePhotoItems(lines, bounds.start, bounds.end, total);
  const expectedCount = expectedItemCount(lines);
  const detectedUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const pricedItems = items.filter((item) => item.price !== null);
  const itemTotal = pricedItems.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const calculated = Math.round((itemTotal + adjustments.reduce((sum, value) => sum + value, 0)) * 100) / 100;
  const warnings: string[] = [];

  if (rejectedPrices.length > 0) {
    warnings.push(`Rejected ${rejectedPrices.length} merchandise price${rejectedPrices.length === 1 ? "" : "s"} grossly above the explicit receipt total.`);
  }
  if (expectedCount !== null && Math.abs(expectedCount - detectedUnits) > 0.001) {
    warnings.push(`Receipt reports ${expectedCount} items, but ${detectedUnits} units were detected.`);
  }
  if (total !== null && items.length > 0 && pricedItems.length === items.length && Math.abs(total - calculated) > 0.05) {
    warnings.push(`Detected purchases and discounts total $${calculated.toFixed(2)}, which differs from the receipt total of $${total.toFixed(2)}.`);
  }

  const purchasedAt = detectDate(text);
  const diagnostics: ReceiptParserDiagnostics = {
    normalisedLines: lines,
    itemSectionLines: section,
    totalLine,
    paymentStartLine: lines.find((line) => paymentMarker.test(line)) ?? null,
  };
  const confidenceParts = [Boolean(purchasedAt), total !== null, items.length > 0, warnings.length === 0];

  return {
    retailer,
    retailerKey,
    purchasedAt,
    total: total ?? (items.length ? calculated : null),
    items,
    warnings,
    diagnostics,
    confidence: Math.round((confidenceParts.filter(Boolean).length / confidenceParts.length) * 100),
  };
}

function structurallySafeText(text: string, ocrLines?: ReceiptOcrLine[]) {
  if (!ocrLines?.length) return text;
  const lines = classifyReceiptLines(ocrLines);
  const safe: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.role === "tender" || line.role === "tax" || line.role === "footer") continue;
    if (line.role === "promotion" && /^\$?\s*\d+[.,]\d{2}$/.test(lines[index + 1]?.text ?? "")) {
      safe.push(`${line.text} ${lines[index + 1].text}`);
      index += 1;
      continue;
    }
    safe.push(line.role === "total" && !/\btotal\b/i.test(line.text) ? `TOTAL ${line.text}` : line.text);
  }
  return safe.join("\n");
}

export function parseReceipt(text: string, ocrLines?: ReceiptOcrLine[]): ParsedReceipt {
  const safeText = structurallySafeText(text, ocrLines);
  if (hasRetailerIdentity(safeText, "woolworths")) return parsePhotoReceipt(safeText, "Woolworths");
  if (hasRetailerIdentity(safeText, "coles")) return parsePhotoReceipt(safeText, "Coles");
  return parseBaseReceipt(safeText);
}
