import assert from "node:assert/strict";
import { parseReceipt } from "../src/lib/receipts/engine/parser";
import { canPopulateReceiptCandidate, chooseReceiptCandidate, chooseReceiptDate, combineReceiptCandidateEvidence, needsReceiptFallback } from "../src/lib/receipts/receipt-ocr-selection";
import { receiptLinesFromBlocks, receiptLinesText } from "../src/lib/receipts/receipt-structure";

const latestReviewOcr = `
f n kel Australi oe py
Kt Privo Of ARN 45 004 89 70
VAMANT 0
J 17 3 ( 500
si ted Checkout y
116 Receipt /
se 19/08/2026 Time 149 4
k Des prion
Coles
PSI MAX COLA 1 25L1T RE 16.00
4 @ $4.00 EACH
PEPSI OR SOLO 1.25L 2 FOR $4.80 -$6.40
ES SUGAR RAW 2KG 3.20
ARE ESPRESSO 750ML 750M 4.50
x 1CE BREAK ICED COFFE 500ML 2.90
MIL KYBAR CHOC BLOCK 170GRAM 3.15
1 TKAT COOKIE DOUGH 170GRAM 3.75
KIT KAT CHUNKY AERO 135GRAM 3.75
HAWALTAN PIZZA SCROL 2PACK 4.15
Total for 11 items: $35.60
EFT $25.00
EFT $10.60
GST INCLUDED IN TOTAL $2.57
09/08/26
`;

// Exact review fields shown by the deployed mobile scan after PR #160. The
// total survived, but OCR column debris, a split price and one cents error
// corrupted individual products. This must be repaired structurally before UI
// population rather than hidden by a correct receipt total.
const mobileReviewOcr = `
Coles
se 19/08/2026 Time 14:20
5F FPST MAX COLA 1 25LITRE 16.00
4 @ $4.00 EACH
PEPSI OR SOLO 1.25L 2 FOR $4.80 -$6.40
5 SUGAR RAW 2KG 3.20
ARE ESPRESSO 750ML 750ML 4.50
ICE BREAK ICED COFFE S000ML 2.90
4MILKYBAR CHOC BLOCK 170GRAM 3 7
ve K11kAT COOKIE DOUGH 170GRAM 3.79
KIT KAT CHUNKY AERO 155GRAM 3.75
HAWAIIAN PIZZA SCROL 2PACK 4.15
Total for 11 items: $35.60
EFT $25.00
EFT $10.60
09/08/26 14:20
`;

const mobileLines = receiptLinesFromBlocks(undefined, mobileReviewOcr);
const mobile = parseReceipt(receiptLinesText(mobileLines), mobileLines);
assert.equal(mobile.purchasedAt, "2026-08-09");
assert.equal(mobile.total, 35.6);
assert.equal(mobile.items.length, 8);
assert.equal(mobile.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.deepEqual(mobile.items.map(({ description, quantity, price }) => ({ description, quantity, price })), [
  { description: "5F FPST MAX COLA 1 25LITRE", quantity: 4, price: 16 },
  { description: "5 SUGAR RAW 2KG", quantity: 1, price: 3.2 },
  { description: "ARE ESPRESSO 750ML 750ML", quantity: 1, price: 4.5 },
  { description: "ICE BREAK ICED COFFE S000ML", quantity: 1, price: 2.9 },
  { description: "4MILKYBAR CHOC BLOCK 170GRAM", quantity: 1, price: 3.75 },
  { description: "ve K11kAT COOKIE DOUGH 170GRAM", quantity: 1, price: 3.75 },
  { description: "KIT KAT CHUNKY AERO 155GRAM", quantity: 1, price: 3.75 },
  { description: "HAWAIIAN PIZZA SCROL 2PACK", quantity: 1, price: 4.15 },
]);
assert.deepEqual(mobile.warnings, []);
const noisyHeaderDate = parseReceipt("Coles\n19/08/2026\nMILK 3.20\nBREAD 4.00\nEGGS 5.00\nTotal $12.20", undefined);
assert.equal(chooseReceiptDate([
  { ocrConfidence: 80, parsed: noisyHeaderDate, pass: "structured", text: "Coles\n19/08/2026\nproducts\nTotal $35.60" },
  { ocrConfidence: 70, parsed: mobile, pass: "structured", text: mobileReviewOcr },
]), "2026-08-09", "a clean footer date from a reconciled candidate must beat noisy header OCR");

const latestLines = receiptLinesFromBlocks(undefined, latestReviewOcr);
const latest = parseReceipt(receiptLinesText(latestLines), latestLines);
assert.equal(latest.retailer, "Coles");
assert.equal(latest.purchasedAt, "2026-08-09", "a clean footer receipt date must beat a noisy embedded header date");
assert.equal(latest.total, 35.6);
assert.equal(latest.items.length, 8, "damaged receipt header metadata must not become blank-price purchase lines");
assert.equal(latest.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.equal(latest.items.some((item) => /Australi|ARN|VAMANT|Checkout|Receipt|Des prion|19\/08\/2026/i.test(item.description)), false);
assert.match(latest.warnings.join("\n"), /differs from the receipt total/, "the 3.15 Milkybar OCR price must remain visibly unreconciled");

const latestCandidate = { ocrConfidence: 72, parsed: latest, pass: "structured" as const, text: receiptLinesText(latestLines), lines: latestLines };
assert.equal(canPopulateReceiptCandidate(latestCandidate), true);

const reconciledText = latestReviewOcr.replace("MIL KYBAR CHOC BLOCK 170GRAM 3.15", "MIL KYBAR CHOC BLOCK 170GRAM 3.75");
const reconciledLines = receiptLinesFromBlocks(undefined, reconciledText);
const reconciled = parseReceipt(receiptLinesText(reconciledLines), reconciledLines);
const reconciledCandidate = { ocrConfidence: 68, parsed: reconciled, pass: "structured" as const, text: receiptLinesText(reconciledLines), lines: reconciledLines };
assert.equal(reconciled.purchasedAt, "2026-08-09");
assert.deepEqual(reconciled.warnings, []);
assert.equal(reconciled.items.length, 8);
assert.equal(reconciled.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.equal(chooseReceiptCandidate([latestCandidate, reconciledCandidate]), reconciledCandidate, "a lower-confidence OCR pass that exactly reconciles the receipt must beat a wrong-price pass");

// Latest production review after PR #160: one OCR representation had the right
// merchandise boundary and total, but lost the Pepsi quantity, lost the Milkybar
// price and misread the receipt date as the future 19/08/2026. Another pass can
// carry those missing fields. Evidence should be combined only across candidates
// that agree on retailer, total and item order rather than trusting one pass whole.
const screenshotItems = reconciled.items.map((item, index) => {
  if (index === 0) return { ...item, quantity: 1, sourceText: item.description };
  if (index === 4) return { ...item, price: null, sourceText: "4MILKYBAR CHOC BLOCK 170GRAM 3 7" };
  return item;
});
const screenshotCandidate = {
  ...reconciledCandidate,
  ocrConfidence: 86,
  parsed: { ...reconciled, purchasedAt: "2026-08-19", items: screenshotItems, warnings: [] },
};
const corroboratingCandidate = {
  ...reconciledCandidate,
  ocrConfidence: 61,
  parsed: {
    ...reconciled,
    purchasedAt: "2026-08-09",
    items: reconciled.items.map((item, index) => index === 0
      ? { ...item, quantity: 4, sourceText: `${item.description} | 4 @ $4.00 EACH` }
      : item),
  },
};
assert.equal(needsReceiptFallback(screenshotCandidate), true, "a selected pass with an unpriced purchase must trigger the other OCR passes");
const combined = combineReceiptCandidateEvidence(screenshotCandidate, [screenshotCandidate, corroboratingCandidate], new Date("2026-08-13T01:12:00+10:00"));
assert.equal(combined.parsed.purchasedAt, "2026-08-09", "a future OCR date must not beat corroborated same-receipt evidence");
assert.equal(combined.parsed.items[0]?.quantity, 4, "an explicit 4 @ $4.00 quantity from another aligned pass must restore Pepsi quantity");
assert.equal(combined.parsed.items[4]?.price, 3.75, "a missing Milkybar price may be filled from an aligned pass without replacing conflicting non-null prices");
assert.equal(combined.parsed.items.reduce((sum, item) => sum + item.quantity, 0), 11);

console.log("Latest Yamanto review regression checks passed.");
