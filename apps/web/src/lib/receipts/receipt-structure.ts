export interface ReceiptOcrBox { x0: number; y0: number; x1: number; y1: number }
export interface ReceiptOcrLine { text: string; confidence: number; bbox: ReceiptOcrBox | null }
export type ReceiptLineRole = "header" | "product" | "quantity" | "promotion" | "item-count" | "total" | "tender" | "tax" | "footer" | "unknown";
export interface ClassifiedReceiptLine extends ReceiptOcrLine { role: ReceiptLineRole }

const money = /-?\$?\s*\d+[.,]\d{2}\b/;
const total = /^(?:grand\s+)?(?:total|l[o0]te!?l|[l1\[({]?[t7]?otal|tal)\b/i;
const itemCount = /\b\d+\s+(?:items?|[1il]tens?)\b/i;
const tender = /^(?:eft|ef[t1i]|cl\b|cf\]?\b|visa|mastercard|card|purchase|change)\b/i;
const tax = /\b(?:gst|g3t|3st|gs[!1t])\b|^tax\b(?!\s+invoice)|\binc[i1l]?\s*uded\s+in\s+total\b|\bincluded\s+in\s+total\b/i;
const promotion = /-\s*\$?\d+[.,]\d{2}\b|\b(?:promo|save|redeemed free|\d+\s+for(?:\s+\$?\d)?)/i;
const header = /^(?:coles|woolworths|tax invoice|store|phone|served by|register|receipt|date|time|description)\b/i;
const receiptDate = /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}(?:\s+\d{1,2}:\d{2})?\b/;
const footer = /^(?:expiry|balance|rrn|apsn|merchant|approved)\b/i;
const terminalMoney = /(-?\$?\s*\d+[.,]\d{2})\s*$/;

function moneyValues(text: string) {
  return [...text.matchAll(/-?\$?\s*(\d+)[.,](\d{2})\b/g)].map((match) => {
    const value = Number(`${match[1]}.${match[2]}`);
    return match[0].trim().startsWith("-") ? -value : value;
  });
}

function lastMoneyValue(text: string) {
  return moneyValues(text).at(-1) ?? null;
}

function descriptionBeforeMoney(text: string) {
  const match = text.match(terminalMoney);
  return (match ? text.slice(0, match.index) : text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function weakMoneyDescription(text: string) {
  const description = descriptionBeforeMoney(text);
  const letters = description.replace(/[^\p{L}]/gu, "");
  const words = description.split(/\s+/).filter(Boolean);
  return lastMoneyValue(text) !== null
    && letters.length <= 10
    && words.length <= 4
    && !/\b\d+(?:\.\d+)?\s*(?:ml|l|litres?|liters?|g|grams?|kg|packs?)\b/i.test(description)
    && !/\beach\b/i.test(description);
}

function normaliseOcrLine(text: string) {
  let value = text.replace(/\s+/g, " ").trim();
  value = value.replace(/\$(\d{1,4})\s+(\d{2})(?=\s|$)/g, (_match, dollars: string, cents: string) => `$${dollars}.${cents}`);
  value = value.replace(/(\s)(\d{1,4})\s+(\d{2})\s*$/g, (_match, prefix: string, dollars: string, cents: string) => `${prefix}${dollars}.${cents}`);
  value = value.replace(/(\s)(\d{1,4})[.,](\d)\s*$/g, (_match, prefix: string, dollars: string, cents: string) => `${prefix}${dollars}.${cents}0`);
  value = value.replace(/(\s)(\d{1,4})\s*[.,]\s*[oO]\s*$/g, (_match, prefix: string, dollars: string) => `${prefix}${dollars}.00`);
  if (/^(?:l?[o0]te!?l|l?otal|tal|[\[({]?otal)\s+for\b/i.test(value)) {
    value = value.replace(/^(?:l?[o0]te!?l|l?otal|tal|[\[({]?otal)/i, "Total");
  }
  return value;
}

export function classifyReceiptLine(line: ReceiptOcrLine): ClassifiedReceiptLine {
  const text = line.text.replace(/\s+/g, " ").trim();
  let role: ReceiptLineRole = "unknown";
  if (total.test(text)) role = "total";
  else if (itemCount.test(text)) role = "item-count";
  else if (tender.test(text)) role = "tender";
  else if (tax.test(text)) role = "tax";
  else if (promotion.test(text)) role = "promotion";
  else if (header.test(text) && !money.test(text)) role = "header";
  else if (receiptDate.test(text)) role = "header";
  else if (footer.test(text)) role = "footer";
  else if (/^(?:qty\s+)?\d+(?:\.\d+)?\s*@/i.test(text)) role = "quantity";
  else if (money.test(text) && /[a-z]/i.test(text)) role = "product";
  return { ...line, text, role };
}

export function classifyReceiptLines(lines: ReceiptOcrLine[]) {
  const classified = lines.map((line) => classifyReceiptLine({ ...line, text: normaliseOcrLine(line.text) }));
  const firstTerminal = classified.findIndex((line) => line.role === "tender" || line.role === "tax" || line.role === "footer");
  let totalIndex = classified.findIndex((line) => line.role === "total" || line.role === "item-count");

  // A damaged quantity row can look like a second tiny product. Use its numeric
  // relationship with the preceding line total to recover the row's structure.
  // Real camera OCR can also lose the @ symbol while preserving the word EACH;
  // in that case the ratio is more trustworthy than the damaged leading digit.
  for (let index = 1; index < classified.length; index += 1) {
    const previousAmount = moneyValues(classified[index - 1].text).at(-1);
    const unitAmount = moneyValues(classified[index].text).at(-1);
    const label = classified[index].text.replace(money, " ").trim();
    const ratio = previousAmount && unitAmount ? previousAmount / unitAmount : 0;
    const explicitEach = /\beach\b/i.test(classified[index].text);
    if (classified[index - 1].role === "product" && classified[index].role === "product"
      && (explicitEach || !/[a-z]{4,}/i.test(label) || weakMoneyDescription(classified[index].text))
      && Number.isInteger(ratio) && ratio >= 2 && ratio <= 20) {
      classified[index] = { ...classified[index], text: `${ratio} @ $${unitAmount!.toFixed(2)} EACH`, role: "quantity" };
    }
  }

  // Coles commonly prints split tenders immediately before the GST section. If
  // their sum matches an earlier amount, that earlier line is the total boundary
  // even when its label was destroyed by OCR.
  if (totalIndex < 0 && firstTerminal > 2 && classified[firstTerminal].role === "tax") {
    const pricedBeforeTax = classified.slice(Math.max(0, firstTerminal - 6), firstTerminal)
      .map((line, offset) => ({ index: Math.max(0, firstTerminal - 6) + offset, value: moneyValues(line.text).at(-1) }))
      .filter((entry): entry is { index: number; value: number } => entry.value !== undefined && entry.value > 0);
    const tenders = pricedBeforeTax.slice(-2);
    if (tenders.length === 2) {
      const tenderTotal = Math.round((tenders[0].value + tenders[1].value) * 100) / 100;
      const matchingTotal = pricedBeforeTax.slice(0, -2).reverse().find((entry) => Math.abs(entry.value - tenderTotal) <= 0.01);
      if (matchingTotal) {
        totalIndex = matchingTotal.index;
        classified[totalIndex] = { ...classified[totalIndex], role: "total" };
      }
    }
  }

  // OCR frequently separates a damaged item-count label from its amount. Locate the
  // summary structurally: it is the final standalone amount immediately before the
  // tax/payment/footer section, not another merchandise candidate.
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

function sanitiseReceiptLines(lines: ReceiptOcrLine[]) {
  const classified = classifyReceiptLines(lines);
  let totalIndex = classified.findIndex((line) => line.role === "total" || line.role === "item-count");
  const taxIndex = classified.findIndex((line) => line.role === "tax");

  // In the production Yamanto scan the explicit total was lost, while two damaged
  // payment labels immediately before GST still carried $25.00 and $10.60. When at
  // least two consecutive weak/tender rows sit directly before tax, their sum is a
  // safer receipt total than summing every OCR line as merchandise.
  if (totalIndex < 0 && taxIndex > 1) {
    const tenderIndexes: number[] = [];
    for (let index = taxIndex - 1; index >= Math.max(0, taxIndex - 4); index -= 1) {
      const line = classified[index];
      const amount = lastMoneyValue(line.text);
      if (amount === null || amount <= 0) break;
      if (line.role === "tender" || weakMoneyDescription(line.text)) tenderIndexes.unshift(index);
      else break;
    }

    if (tenderIndexes.length >= 2) {
      const recoveredTotal = Math.round(tenderIndexes.reduce((sum, index) => sum + (lastMoneyValue(classified[index].text) ?? 0), 0) * 100) / 100;
      const firstTender = tenderIndexes[0];
      for (const index of tenderIndexes) classified[index] = { ...classified[index], role: "tender" };
      classified.splice(firstTender, 0, {
        text: `TOTAL $${recoveredTotal.toFixed(2)}`,
        confidence: Math.min(...tenderIndexes.map((index) => classified[index]?.confidence ?? 0)),
        bbox: null,
        role: "total",
      });
      totalIndex = firstTender;
    }
  }

  if (totalIndex >= 0) {
    for (let index = totalIndex + 1; index < classified.length; index += 1) {
      if (classified[index].role === "product" || classified[index].role === "unknown") {
        classified[index] = { ...classified[index], role: "footer" };
      }
    }
  }

  return classified.filter((line) => line.role !== "tender" && line.role !== "tax" && line.role !== "footer");
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

  // Tesseract's aggregate text is substantially more coherent on photographed
  // receipts than rebuilding strings from noisy layout blocks. Prefer aggregate
  // text for parsing and keep block geometry as a fallback when text is absent.
  if (fallbackLines.length > 0) return sanitiseReceiptLines(fallbackLines);

  const blockLines = blocks?.flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []).map((line) => ({
    text: line.text?.trim() ?? "",
    confidence: line.confidence ?? 0,
    bbox: line.bbox ?? null,
  })).filter((line) => line.text) ?? [];
  return blockLines;
}

export function receiptLinesText(lines: ReceiptOcrLine[]) {
  return lines.map((line) => line.text).join("\n");
}
