import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReceipt } from "../src/lib/receipts/engine/parser";
import { chooseReceiptCandidate, needsReceiptFallback } from "../src/lib/receipts/receipt-ocr-selection";

const woolworthsPhotoText = `
Woolworths
The fresh food people
2621 Springwood PH: 07 3826 2520
34 Fitzgerald Avenue
TAX INVOICE - ABN 88 000 014 675
POS 065 TRANS 2646 13:46 02/08/2026
#Pepsi Max Cola Drink 1.25L
Qty 3 @ $2.25 each 6.75
#KitKat Cookie Dough Block 170g 5.00
#KitKat Aero Mint Block 155g 5.00
5 SUBTOTAL $16.75
TOTAL $16.75
MERCH ID: 61000604002621
Visa Debit PURCHASE $16.75
`;

const woolworths = parseReceipt(woolworthsPhotoText);
assert.equal(woolworths.retailer, "Woolworths");
assert.equal(woolworths.purchasedAt, "2026-08-02");
assert.equal(woolworths.total, 16.75);
assert.deepEqual(
  woolworths.items.map(({ description, quantity, price }) => ({ description, quantity, price })),
  [
    { description: "Pepsi Max Cola Drink 1 25L", quantity: 3, price: 6.75 },
    { description: "KitKat Cookie Dough Block 170g", quantity: 1, price: 5 },
    { description: "KitKat Aero Mint Block 155g", quantity: 1, price: 5 },
  ],
);
assert.deepEqual(woolworths.warnings, []);

const colesPhotoText = `
Coles Supermarkets Australia Pty Ltd
Tax Invoice ABN: 45 004 189 708
Store: 4089 - CS YAMANTO
Register: 116 Receipt: 5967
Date: 09/08/2026 Time: 14:20
Description $
% PEPSI MAX COLA 1.25LITRE 16.00
4 @ $4.00 EACH
PEPSI OR SOLO 1.25L 2 FOR $4.80 -$6.40
COLES SUGAR RAW 2KG 3.20
%DARE ESPRESSO 750ML 4.50
%ICE BREAK ICED COFFEE 500ML 2.90
%MILKYBAR CHOC BLOCK 170GRAM 3.75
%KITKAT COOKIE DOUGH 170GRAM 3.75
%KIT KAT CHUNKY AERO 155GRAM 4.19
HAWAIIAN PIZZA SCROL 2PACK 3.75
Total for 11 items: $35.60
EFT $25.00
EFT $10.60
GST INCLUDED IN TOTAL $2.57
`;

const coles = parseReceipt(colesPhotoText);
assert.equal(coles.retailer, "Coles");
assert.equal(coles.purchasedAt, "2026-08-09");
assert.equal(coles.total, 35.6);
assert.equal(coles.items.length, 8);
assert.deepEqual(
  coles.items[0] && { description: coles.items[0].description, quantity: coles.items[0].quantity, price: coles.items[0].price },
  { description: "PEPSI MAX COLA 1 25LITRE", quantity: 4, price: 16 },
);
assert.equal(coles.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.deepEqual(coles.warnings, []);
assert.deepEqual(
  coles.items.find((item) => item.description === "KIT KAT CHUNKY AERO 155GRAM"),
  { description: "KIT KAT CHUNKY AERO 155GRAM", quantity: 1, price: 4.19, sourceText: "%KIT KAT CHUNKY AERO 155GRAM 4.19", confidence: 96 },
);
assert.equal(coles.items.find((item) => item.description.includes("SCROL 2PACK"))?.price, 3.75);
assert.equal(coles.items.some((item) => /11\s+items|EFT|PEPSI OR SOLO|25\.00|6\.40/.test(`${item.description} ${item.price}`)), false);

const splitColesSummary = parseReceipt(colesPhotoText
  .replace("HAWAIIAN PIZZA SCROL 2PACK 3.75\nTotal for 11 items: $35.60", "HAWAIIAN PIZZA SCROL 2PACK\n11 items\n$35.60")
  .replace("EFT $25.00", "EFT\n$25.00"));
assert.equal(splitColesSummary.total, 35.6);
assert.equal(splitColesSummary.items.some((item) => item.price === 35.6 || item.price === 25), false);
assert.equal(splitColesSummary.items.some((item) => /11\s+items|EFT|PEPSI OR SOLO/.test(item.description)), false);
assert.equal(splitColesSummary.diagnostics.totalLine, "11 items | $35.60");

const incompleteColes = parseReceipt(colesPhotoText.replace("HAWAIIAN PIZZA SCROL 2PACK 3.75\n", ""));
const selected = chooseReceiptCandidate([
  { ocrConfidence: 88, parsed: incompleteColes, pass: "structured", text: "incomplete" },
  { ocrConfidence: 71, parsed: coles, pass: "sparse", text: "complete" },
]);
assert.equal(needsReceiptFallback({ ocrConfidence: 88, parsed: incompleteColes, pass: "structured", text: "incomplete" }), true);
assert.equal(selected?.text, "complete", "a complete, reconciled receipt should beat a higher-confidence but incomplete OCR pass");
const missingTotal = parseReceipt(woolworthsPhotoText.replace("TOTAL $16.75\n", ""));
assert.equal(
  needsReceiptFallback({ ocrConfidence: 90, parsed: missingTotal, pass: "structured", text: "missing total" }),
  true,
  "a plausible item list without a recognised receipt total still needs the fallback OCR pass",
);

const receiptPageStyles = readFileSync(new URL("../src/components/receipts/ReceiptWorkspace.module.css", import.meta.url), "utf8");
assert.doesNotMatch(receiptPageStyles, /min-height:\s*(?:62|100)dvh/, "receipt capture must not dominate an entire phone or desktop viewport");
assert.match(receiptPageStyles, /grid-template-columns:\s*minmax\(0,\s*1\.55fr\)\s+minmax\(310px,\s*\.72fr\)/);

console.log("Receipt photo parser regression checks passed.");
