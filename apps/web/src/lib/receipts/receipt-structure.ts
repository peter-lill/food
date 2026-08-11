export interface ReceiptOcrBox { x0: number; y0: number; x1: number; y1: number }
export interface ReceiptOcrLine { text: string; confidence: number; bbox: ReceiptOcrBox | null }
export type ReceiptLineRole = "header" | "product" | "quantity" | "promotion" | "item-count" | "total" | "tender" | "tax" | "footer" | "unknown";
export interface ClassifiedReceiptLine extends ReceiptOcrLine { role: ReceiptLineRole }

const money = /-?\$?\s*\d+[.,]\d{2}\b/;
const total = /^(?:grand\s+)?(?:total|[\[({]?[t7]?otal|tal)\b/i;
const itemCount = /\b\d+\s+(?:items?|[1il]tens?)\b/i;
const tender = /^(?:eft|ef[t1i]|cl\b|cf\]?\b|visa|mastercard|card|purchase|change)\b/i;
const tax = /\b(?:gst|tax)\b/i;
const promotion = /-\s*\$?\d+[.,]\d{2}\b|\b(?:promo|save|redeemed free|\d+\s+for\s+\$?)\b/i;
const header = /^(?:coles|woolworths|tax invoice|store|phone|served by|register|receipt|date|time|description)\b/i;
const footer = /^(?:expiry|balance|rrn|apsn|merchant|approved)\b/i;

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
  return lines.map(classifyReceiptLine);
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
  const lines = blocks?.flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []).map((line) => ({
    text: line.text?.trim() ?? "",
    confidence: line.confidence ?? 0,
    bbox: line.bbox ?? null,
  })).filter((line) => line.text) ?? [];
  if (lines.length > 0) return lines;
  return fallbackText.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text) => ({ text, confidence: 0, bbox: null }));
}

export function receiptLinesText(lines: ReceiptOcrLine[]) {
  return lines.map((line) => line.text).join("\n");
}
