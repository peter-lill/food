export * from "./types";

import { parseReceipt as parseEnhancedReceipt } from "./parseReceiptEnhanced";
import type { ReceiptOcrLine } from "../../receipt-structure";

function expectedItemCount(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/(?:total|[\[({]?otal)\s+(?:for\s+)?(\d+)\s+items?/i)
      ?? line.match(/^(\d+)\s+[1il]tens?[:;]?$/i)
      ?? line.match(/^(\d+)\s+items?:?$/i)
      ?? line.match(/(\d+)\s+subtotal\b/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function legacyPlainTextResult(result: ReturnType<typeof parseEnhancedReceipt>) {
  const hadUnpricedItems = result.items.some((item) => item.price === null);
  if (!hadUnpricedItems) return result;

  const items = result.items.filter((item) => item.price !== null);
  const warnings = [...result.warnings];

  // Structured camera OCR intentionally preserves a readable product when only its
  // price was lost. Plain-text parser callers historically dropped those incomplete
  // rows, so keep that behaviour for existing fixtures and imports that do not
  // provide OCR structure.
  const expectedCount = expectedItemCount(result.diagnostics.normalisedLines);
  const detectedUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  if (expectedCount !== null && Math.abs(expectedCount - detectedUnits) > 0.001
    && !warnings.some((warning) => /^Receipt reports /i.test(warning))) {
    warnings.push(`Receipt reports ${expectedCount} items, but ${detectedUnits} units were detected.`);
  }

  if (result.total !== null && items.length > 0 && !warnings.some((warning) => /differs from the receipt total/i.test(warning))) {
    const adjustments = result.diagnostics.itemSectionLines.reduce((sum, line) => {
      const values = [...line.matchAll(/-\$?\s*(\d+)[.,](\d{2})\b/g)]
        .map((match) => -Number(`${match[1]}.${match[2]}`));
      return sum + values.reduce((lineSum, value) => lineSum + value, 0);
    }, 0);
    const calculated = Math.round((items.reduce((sum, item) => sum + (item.price ?? 0), 0) + adjustments) * 100) / 100;
    if (Math.abs(result.total - calculated) > 0.05) {
      warnings.push(`Detected purchases and discounts total $${calculated.toFixed(2)}, which differs from the receipt total of $${result.total.toFixed(2)}.`);
    }
  }

  const confidenceParts = [Boolean(result.purchasedAt), result.total !== null, items.length > 0, warnings.length === 0];
  return {
    ...result,
    items,
    warnings,
    confidence: Math.round((confidenceParts.filter(Boolean).length / confidenceParts.length) * 100),
  };
}

export function parseReceipt(text: string, ocrLines?: ReceiptOcrLine[]) {
  const result = parseEnhancedReceipt(text, ocrLines);
  return ocrLines?.length ? result : legacyPlainTextResult(result);
}
