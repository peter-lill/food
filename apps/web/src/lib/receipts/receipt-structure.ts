export interface ReceiptOcrBox { x0: number; y0: number; x1: number; y1: number }
export interface ReceiptOcrLine { text: string; confidence: number; bbox: ReceiptOcrBox | null }
export type ReceiptLineRole = "header" | "product" | "quantity" | "promotion" | "item-count" | "total" | "tender" | "tax" | "footer" | "unknown";
export interface ClassifiedReceiptLine extends ReceiptOcrLine { role: ReceiptLineRole }

const money = /-?\$?\s*\d+[.,]\d{2}\b/;
const total = /^(?:grand\s+)?(?:total|[l1\[({]?[t7]?otal|tal)\b/i;
const itemCount = /\b\d+\s+(?:items?|[1il]tens?)\b/i;
const tender = /^(?:eft|ef[t1i]|cl\b|cf\]?\b|visa|mastercard|card|purchase|change)\b/i;
const tax = /\b(?:gst|g3t|3st|gs[!1t])\b|^tax\b(?!\s+invoice)|\binc[i1l]?\s*uded\s+in\s+total\b|\bincluded\s+in\s+total\b/i;
const promotion = /-\s*\$?\d+[.,]\d{2}\b|\b(?:promo|save|redeemed free|\d+\s+for(?:\s+\$?\d)?)/i;
const header = /^(?:coles|woolworths|tax invoice|store|phone|served by|register|receipt|date|time|description)\b/i;
const footer = /^(?:expiry|balance|rrn|apsn|merchant|approved)\b/i;
const terminalMoney = /(-?\$?\s*\d+[.,]\d{2})\s*$/;

function parseAmount(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace("$", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function lastAmount(text: string) {
  const match = text.match(terminalMoney);
  return match ? parseAmount(match[1]) : null;
}

function descriptionBeforeAmount(text: string) {
  const match = text.match(terminalMoney);
  return (match ? text.slice(0, match.index) : text).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function weakMoneyDescription(text: string) {
  const description = descriptionBeforeAmount(text);
  const letters = description.replace(/[^\p{L}]/gu, "");
  const words = description.split(/\s+/).filter(Boolean);
  return Boolean(lastAmount(text) && letters.length <= 10 && words.length <= 4 && !/\b(?:ml|litre|liter|gram|kg|pack|each)\b/i.test(description));
}

function normaliseOcrMoneySpacing(text: string) {
  let value = text.replace(/\s+/g, " ").trim();
  value = value.replace(/\$(\d{1,4})\s+(\d{2})(?=\s|$)/g, (_match, dollars: string, cents: string) => `$${dollars}.${cents}`);
  value = value.replace(/(\s)(\d{1,4})\s+(\d{2})\s*$/g, (_match, prefix: string, dollars: string, cents: string) => `${prefix}${dollars}.${cents}`);
  if (/^(?:l?otal|tal|[\[({]?otal)\s+for\b/i.test(value)) {
    value = value.replace(/^(?:l?otal|tal|[\[({]?otal)/i, "Total");
  }
  return value;
}

function repairQuantityFragments(lines: ReceiptOcrLine[]) {
  const repaired = [...lines];
  for (let index = 1; index < repaired.length; index += 1) {
    const current = repaired[index];
    const previous = repaired[index - 1];
    const unitPrice = lastAmount(current.text);
    const previousTotal = lastAmount(previous.text);
    if (unitPrice === null || previousTotal === null || unitPrice <= 0 || previousTotal <= unitPrice) continue;

    const explicitEach = /\beach\b|\bea\.?\b/i.test(current.text);
    if (!explicitEach && !weakMoneyDescription(current.text)) continue;

    const ratio = previousTotal / unitPrice;
    const quantity = Math.round(ratio);
    if (quantity < 2 || quantity > 20 || Math.abs(ratio - quantity) > 0.015) continue;

    current.text = `${quantity} @ $${unitPrice.toFixed(2)} EACH`;
  }
  return repaired;
}

function repairStructuralBoundaries(lines: ReceiptOcrLine[]) {
  const repaired = repairQuantityFragments(lines.map((line) => ({ ...line, text: normaliseOcrMoneySpacing(line.text) })));
  const classified = repaired.map(classifyReceiptLine);
  const explicitTotalIndex = classified.findIndex((line) => line.role === "total" || line.role === "item-count");
  const taxIndex = classified.findIndex((line) => line.role === "tax");

  if (explicitTotalIndex < 0 && taxIndex > 1) {
    const tenderIndexes: number[] = [];
    for (let index = taxIndex - 1; index >= Math.max(0, taxIndex - 4); index -= 1) {
      const candidate = classified[index];
      const amount = lastAmount(candidate.text);
      if (amount === null || amount <= 0) break;
      if (candidate.role === "tender" || weakMoneyDescription(candidate.text)) tenderIndexes.unshift(index);
      else break;
    }

    if (tenderIndexes.length >= 2) {
      const recoveredTotal = Math.round(tenderIndexes.reduce((sum, index) => sum + (lastAmount(classified[index].text) ?? 0), 0) * 100) / 100;
      const firstTender = tenderIndexes[0];
      for (const index of tenderIndexes) classified[index] = { ...classified[index], role: "tender" };
      classified.splice(firstTender, 0, {
        text: `TOTAL $${recoveredTotal.toFixed(2)}`,
        confidence: Math.min(...tenderIndexes.map((index) => repaired[index]?.confidence ?? 0)),
        bbox: null,
        role: "total",
      });
    }
  }

  const totalIndex = classified.findIndex((line) => line.role === "total" || line.role === "item-count");
  if (totalIndex >= 0) {
    for (let index = totalIndex + 1; index < classified.length; index += 1) {
      if (classified[index].role === "product" || classified[index].role === "unknown") {
        classified[index] = { ...classified[index], role: "footer" };
      }
    }
  }

  return classified.filter((line) => line.role !== "tender" && line.role !== "tax" && line.role !== "footer");
}

export function classifyReceiptLine(line: ReceiptOcrLine): ClassifiedReceiptLine {
  const text = line.text.replace(/\s+/g, " ").trim();
  let role: ReceiptLineRole = "unknown";
  if (total.test(text)) role = "total";
  else if (itemCount.test(text)) role = "item-count";
  else if (tender.test(text)) role = "tender";
  else if (tax.test(text)) role = "tax";
  else if (promotion.test(text)) role = "promotion";
  else if (header.test(text)) role = "header";
  else if (footer.test(text)) role = "footer";
  else if (/^(?:qty\s+)?\d+(?:\.\d+)?\s*@/i.test(text)) role = "quantity";
  else if (money.test(text) && /[a-z]/i.test(text)) role = "product";
  return { ...line, text, role };
}

export function classifyReceiptLines(lines: ReceiptOcrLine[]) {
  const classified = lines.map(classifyReceiptLine);
  const firstTerminal = classified.findIndex((line) => line.role === "tender" || line.role === "tax" || line.role === "footer");
  let totalIndex = classified.findIndex((line) => line.role === "total" || line.role === "item-count");

  if (totalIndex < 0 && firstTerminal > 0) {
    for (let index = firstTerminal - 1; index >= Math.max(0, firstTerminal - 4); index -= 1) {
      if (/^\$?\s*\d+[.,]\d{2}$/.test(classified[index].text)) {
        totalIndex = index;
        classified[index] = { ...classified[index], role: "total" };
        if (index > 0 && classified[index - 1].role === "unknown") {
          classified[index - 1] = { ...classified[index - 1], role: "item-count" };
        }
        break;
      }
    }
  }

  if (totalIndex >= 0) {
    for (let index = totalIndex + 1; index < classified.length; index += 1) {
      if (classified[index].role === "product" || classified[index].role === "unknown") {
        classified[index] = { ...classified[index], role: "footer" };
      }
    }
  }
  return classified;
}

export function receiptStructureScore(lines: ReceiptOcrLine[]) {
  const classified = classifyReceiptLines(lines);
  const roles = new Set(classified.map((line) => line.role));
  const totalIndex = classified.findIndex((line) => line.role === "total");
  const tenderIndex = classified.findIndex((line) => line.role === "tender");
  let score = 0;
  if (roles.has("total")) score += 35;
  if (roles.has("item-count")) score += 15;
  if (roles.has("promotion")) score += 10;
  if (roles.has("tender")) score += 15;
  if (totalIndex >= 0 && tenderIndex > totalIndex) score += 25;
  if (classified.some((line, index) => index > totalIndex && totalIndex >= 0 && line.role === "product")) score -= 40;
  return score;
}

type TesseractBlock = { paragraphs?: Array<{ lines?: Array<{ text?: string; confidence?: number; bbox?: ReceiptOcrBox }> }> };

export function receiptLinesFromBlocks(blocks: TesseractBlock[] | null | undefined, fallbackText: string): ReceiptOcrLine[] {
  const fallbackLines = fallbackText
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text, confidence: 0, bbox: null as ReceiptOcrBox | null }));

  // Tesseract's aggregate text is materially more stable for crumpled receipts than
  // rebuilding text from layout blocks. Keep blocks as a geometry fallback only.
  if (fallbackLines.length > 0) return repairStructuralBoundaries(fallbackLines);

  const blockLines = blocks?.flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []).map((line) => ({
    text: line.text?.trim() ?? "",
    confidence: line.confidence ?? 0,
    bbox: line.bbox ?? null,
  })).filter((line) => line.text) ?? [];
  return repairStructuralBoundaries(blockLines);
}

export function receiptLinesText(lines: ReceiptOcrLine[]) {
  return lines.map((line) => line.text).join("\n");
}
