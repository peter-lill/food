import { parseReceipt as parseBaseReceipt } from "./parseReceipt";
import type { ParsedReceipt, ParsedReceiptItem, ReceiptParserDiagnostics } from "./types";

const moneyPattern = /-?\$?\s*\d+[.,]\d{2}\b/g;

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
    .replace(/^[*%^#~]+\s*/, "")
    .replace(/[^\p{L}\p{N}&'()\-\/\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findWoolworthsTotal(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^\s*total\s*(?:\(\s*\d+\s+items?\s*\))?\s*$/i.test(line)
      && !/^\s*total\s*\(\s*\d+\s+items?\s*\)/i.test(line)) continue;

    const sameLine = moneyValues(line).at(-1);
    if (sameLine !== undefined) return { total: sameLine, totalLine: line, totalIndex: index };

    for (let offset = 1; offset <= 2; offset += 1) {
      const next = lines[index + offset];
      if (!next) break;
      const nextValue = moneyValues(next).at(-1);
      if (nextValue !== undefined) {
        return { total: nextValue, totalLine: `${line} | ${next}`, totalIndex: index };
      }
    }
  }

  return { total: null, totalLine: null, totalIndex: lines.length };
}

function parseWoolworthsItems(lines: string[], totalIndex: number) {
  const descriptionIndex = lines.findIndex((line) => /^description\b/i.test(line));
  const start = descriptionIndex >= 0 ? descriptionIndex + 1 : 0;
  const section = lines.slice(start, totalIndex);
  const items: ParsedReceiptItem[] = [];
  let pendingDescription = "";

  const quantityPattern = /\bqty\s+(\d+(?:\.\d+)?)\s*@\s*\$?\s*(\d+[.,]\d{2})\s*(?:each|ea\.?)?/i;
  const ignored = /^(?:promotional price|total includes gst|everyday rewards|ereceipt|description|price)$/i;

  for (const line of section) {
    if (ignored.test(line) || /^(?:saving|savings|gst|payment|eftpos|visa|mastercard)\b/i.test(line)) continue;

    const quantityMatch = line.match(quantityPattern);
    if (quantityMatch) {
      const quantity = Number(quantityMatch[1]);
      const unitPrice = parseMoney(quantityMatch[2]);
      const values = moneyValues(line);
      const printedTotal = values.length > 1 ? values.at(-1) ?? null : null;
      const lineTotal = printedTotal ?? (unitPrice === null ? null : Math.round(quantity * unitPrice * 100) / 100);
      const inlineDescription = cleanDescription(line.slice(0, quantityMatch.index ?? 0));
      const description = inlineDescription || pendingDescription || items.at(-1)?.description || "";

      if (description && lineTotal !== null) {
        const previous = items.at(-1);
        if (!inlineDescription && !pendingDescription && previous?.description === description) {
          previous.quantity = quantity;
          previous.price = lineTotal;
          previous.sourceText = `${previous.sourceText} | ${line}`;
          previous.confidence = 98;
        } else {
          items.push({ description, quantity, price: lineTotal, sourceText: `${description} | ${line}`, confidence: 98 });
        }
      }
      pendingDescription = "";
      continue;
    }

    const matches = [...line.matchAll(moneyPattern)];
    if (matches.length > 0) {
      const last = matches.at(-1)!;
      const amount = parseMoney(last[0]);
      const inlineDescription = cleanDescription(line.slice(0, last.index ?? 0));
      const description = inlineDescription || pendingDescription;
      if (amount !== null && amount >= 0 && description && !/^qty\b/i.test(description)) {
        items.push({ description, quantity: 1, price: amount, sourceText: line, confidence: 96 });
      }
      pendingDescription = "";
      continue;
    }

    const cleaned = cleanDescription(line);
    if (cleaned && /[a-z]/i.test(cleaned) && !/^(?:special|save|promotion)/i.test(cleaned)) {
      pendingDescription = pendingDescription ? `${pendingDescription} ${cleaned}` : cleaned;
      if (pendingDescription.length > 140) pendingDescription = cleaned;
    }
  }

  return { items, section };
}

function parseWoolworthsReceipt(text: string): ParsedReceipt {
  const lines = normaliseLines(text);
  const { total, totalLine, totalIndex } = findWoolworthsTotal(lines);
  const { items, section } = parseWoolworthsItems(lines, totalIndex);
  const dateMatch = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  const purchasedAt = dateMatch
    ? `${dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`
    : null;
  const expectedMatch = lines.find((line) => /^\s*total\s*\(\s*\d+\s+items?\s*\)/i.test(line))?.match(/(\d+)\s+items?/i);
  const expectedCount = expectedMatch ? Number(expectedMatch[1]) : null;
  const detectedUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const calculated = Math.round(items.reduce((sum, item) => sum + (item.price ?? 0), 0) * 100) / 100;
  const warnings: string[] = [];

  if (expectedCount !== null && Math.abs(expectedCount - detectedUnits) > 0.001) {
    warnings.push(`Receipt reports ${expectedCount} items, but ${detectedUnits} units were detected.`);
  }
  if (total !== null && items.length > 0 && Math.abs(total - calculated) > 0.05) {
    warnings.push(`Detected purchases total $${calculated.toFixed(2)}, which differs from the receipt total of $${total.toFixed(2)}.`);
  }

  const diagnostics: ReceiptParserDiagnostics = {
    normalisedLines: lines,
    itemSectionLines: section,
    totalLine,
    paymentStartLine: lines.find((line) => /^(?:payment|eftpos|visa|mastercard)\b/i.test(line)) ?? null,
  };

  const confidenceParts = [Boolean(purchasedAt), total !== null, items.length > 0, warnings.length === 0];
  return {
    retailer: "Woolworths",
    retailerKey: "woolworths",
    purchasedAt,
    total: total ?? (items.length ? calculated : null),
    items,
    warnings,
    diagnostics,
    confidence: Math.round((confidenceParts.filter(Boolean).length / confidenceParts.length) * 100),
  };
}

export function parseReceipt(text: string): ParsedReceipt {
  if (/\bwoolworths\b|everyday rewards|\bereceipt\b/i.test(text)) {
    return parseWoolworthsReceipt(text);
  }
  return parseBaseReceipt(text);
}
