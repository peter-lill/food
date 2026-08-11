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

const productionColesRegression = parseReceipt(`
Coles Supermarkets Australia Pty Ltd
Tax Invoice ABN: 45 004 189 708
Description $
COLES SUGAR RAW 2KG 4.50
ICE BREAK ICED COFFEE 500ML 2.90
MILKYBAR CHOC BLOCK 170GRAM 83.75
KIT KAT CHUNKY AERO 155GRAM 4.19
HAWAIIAN PIZZA SCROL 2PACK
11 items
$35.60
or 11 1160s 29.00
EFT $25.00
EFT $10.60
GST INCLUDED IN TOTAL $2.57
`);
assert.equal(productionColesRegression.total, 35.6, "the explicit Coles total must override malformed merchandise sums");
assert.deepEqual(
  productionColesRegression.items.find((item) => item.description === "KIT KAT CHUNKY AERO 155GRAM"),
  { description: "KIT KAT CHUNKY AERO 155GRAM", quantity: 1, price: 4.19, sourceText: "KIT KAT CHUNKY AERO 155GRAM 4.19", confidence: 96 },
);
assert.equal(productionColesRegression.items.find((item) => item.description === "COLES SUGAR RAW 2KG")?.price, 4.5);
assert.equal(productionColesRegression.items.find((item) => item.description === "ICE BREAK ICED COFFEE 500ML")?.price, 2.9);
assert.equal(productionColesRegression.items.some((item) => /MILKYBAR|SCROL|11\s+items|EFT|or 11 1160s/i.test(item.description)), false);
assert.equal(productionColesRegression.items.some((item) => item.price === 35.6 || item.price === 29 || item.price === 25), false);
assert.match(productionColesRegression.warnings.join("\n"), /Rejected 1 merchandise price grossly above the explicit receipt total/);
assert.match(productionColesRegression.warnings.join("\n"), /differs from the receipt total of \$35\.60/);

const damagedTotalLabel = parseReceipt(`
Tax Invoice ABN: 45 004 189 708
Description $
PEPSI MAX COLA 1.25LITRE 16.00
4 @ 4.00 EACH
PEPSI OR SOLO 1.25L 2 FOR 4.80 -6.40
COLES SUGAR RAW 2KG 3.20
DARE ESPRESSO 750ML 4.50
ICE BREAK ICED COFFEE 500ML 2.90
MILKYBAR CHOC BLOCK 170GRAM 3.75
KITKAT COOKIE DOUGH 170GRAM 3.75
KIT KAT CHUNKY AERO 155GRAM 3.75
HAWAIIAN PIZZA SCROL 2PACK 4.15
$35.60
or 11 1160s 29.00
EFT 25.00
EFT 10.60
GST INCLUDED IN TOTAL 2.57
`);
assert.equal(damagedTotalLabel.retailer, "Coles");
assert.equal(damagedTotalLabel.total, 35.6, "split tender payments should recover a damaged Coles total label");
assert.equal(damagedTotalLabel.diagnostics.totalLine, "$35.60 | reconciled from tender payments");
assert.equal(damagedTotalLabel.items.find((item) => item.description.includes("SCROL 2PACK"))?.price, 4.15);
assert.equal(damagedTotalLabel.items.some((item) => /or 11 1160s|EFT/i.test(item.description)), false);
assert.equal(damagedTotalLabel.items.find((item) => item.description === "KIT KAT CHUNKY AERO 155GRAM")?.price, 3.75);
assert.equal(damagedTotalLabel.items.find((item) => item.description === "COLES SUGAR RAW 2KG")?.price, 3.2);
assert.equal(damagedTotalLabel.items.length, 8);
assert.equal(damagedTotalLabel.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.deepEqual(damagedTotalLabel.warnings, []);

const exactYamantoStructuredOcr = parseReceipt(`
; 650 |
heCK Ou cai]
: “Receipt wn
' 0126 [1me: 14: 2V
$
Jr D1 on
Mix COLA 1.25LITRE 16.00
1 @ $4.00 EACH hn
) SOLO 1.25. 2 FOR $4.8 er
IGAR RAW 2KG 3. £
ARF ESPRESSO 750ML 750ML 4.90
«¥1CF BREAK ICED COFFE 500ML 2.90
MILKYBAR CHOC BLOCK 170GRAM 3.79
2K1TKAT COOKIE DOUGH 170GRAM 3.79
KIT KAT CHUNKY AERO 155GRAM 3.75
HAWAIIAN P1ZZA SCROL 2PACK 4.13
[otal for 11 items; $35.60
Cl $25. 00
CF] $10.60
Coles
09/08, 26
627340) 28
EXPIRY @
PURCHASE
BALANCE
RRN 001
`);
assert.equal(exactYamantoStructuredOcr.total, 35.6, "the exact damaged Yamanto total marker must remain authoritative");
assert.equal(exactYamantoStructuredOcr.diagnostics.totalLine, "[otal for 11 items; $35.60");
assert.equal(exactYamantoStructuredOcr.items.some((item) => /^(?:Cl|CF)$/i.test(item.description)), false);
assert.equal(exactYamantoStructuredOcr.items.some((item) => item.price === 25 || item.price === 10.6), false);
assert.equal(exactYamantoStructuredOcr.items.find((item) => item.description === "KIT KAT CHUNKY AERO 155GRAM")?.price, 3.75);

const exactYamantoSparseOcr = parseReceipt(`
coles
PAY
[ime:
16.00
COLA 1.25LITRE
8 $4.00 EACH
40
w solo 1.25. 2 FOR
$4.8
IGAR RAW 2KG
SSO 750ML 750ML
4
50
AK ICFD COFFE S00ML
2
90
AR CHOC BLOCK 170GRAM
3
9
JOOKIE DOUGH 170GRAM
HUNKY AERO 155GRAM
AWALTAN P1ZZA SCROL 2PACK
tal for
11 1tens:
$35
60
$25.00
$10.60
ST INCLUDED IN TOTA!
2.9/
PURCHASE
BALANCE
`);
assert.equal(exactYamantoSparseOcr.total, 35.6, "fragmented sparse OCR must recover the explicit receipt total");
assert.equal(exactYamantoSparseOcr.diagnostics.totalLine, "tal for | 11 1tens: | $35 | 60");
assert.equal(exactYamantoSparseOcr.items.some((item) => /1tens/i.test(item.description)), false);
assert.equal(exactYamantoSparseOcr.items.some((item) => item.price === 35.6 || item.price === 25 || item.price === 10.6), false);
assert.match(exactYamantoSparseOcr.warnings.join("\n"), /Receipt reports 11 items/);
assert.match(exactYamantoSparseOcr.warnings.join("\n"), /differs from the receipt total of \$35\.60/);
assert.equal(chooseReceiptCandidate([
  { ocrConfidence: 70, parsed: exactYamantoStructuredOcr, pass: "structured", text: "yamanto structured" },
  { ocrConfidence: 65, parsed: exactYamantoSparseOcr, pass: "sparse", text: "yamanto sparse" },
])?.pass, "structured", "the fuller structured OCR must beat the fragmented two-line sparse result");

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
