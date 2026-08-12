import assert from "node:assert/strict";
import { parseReceipt } from "../src/lib/receipts/engine/parser";
import { canPopulateReceiptCandidate, chooseReceiptCandidate } from "../src/lib/receipts/receipt-ocr-selection";
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

console.log("Latest Yamanto review regression checks passed.");
