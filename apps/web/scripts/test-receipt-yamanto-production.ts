import assert from "node:assert/strict";
import { parseReceipt } from "../src/lib/receipts/engine/parser";
import {
  classifyReceiptLines,
  receiptLinesFromBlocks,
  receiptLinesText,
} from "../src/lib/receipts/receipt-structure";

const coherentRawText = `
Coles Supermarkets Australia Pty Ltd
Tax Invoice ABN: 45 004 189 708
Date: 09/08/2026
Description $
PEPSI MAX COLA 1.25LITRE 16.00
4 @ $4.00 EACH
PEPSI OR SOLO 1.25L 2 FOR $4.80 -$6.40
COLES SUGAR RAW 2KG 3.20
DARE ESPRESSO 750ML 4.50
ICE BREAK ICED COFFEE 500ML 2.90
MILKYBAR CHOC BLOCK 170GRAM 3.75
KITKAT COOKIE DOUGH 170GRAM 3.75
KIT KAT CHUNKY AERO 155GRAM 3.75
HAWAIIAN PIZZA SCROL 2PACK 4.15
Total for 11 items: $35.60
EFT $25.00
EFT $10.60
GST INCLUDED IN TOTAL $2.57
`;

const degradedBlockLines = [
  "ee PEPSL MAK COLA 1 25LITRI 16.00",
  "nr a Le 4 4.00",
  "2 FOR 5.40",
  "a RESSO 750ML 750M 4.50",
  "BRIE (F BREAK CED COFFE 500M 2.90",
  "BRIER M11 KVBAR CHOC BLOCK 170GRAM 3.75",
  "RRR KITKAT COOKIE DOUGH 1 70GRAM 3.79",
  "a ie AAWALLIAN PIZZA SCROL 2PACK 4.15",
  "Lhe AL 25.00",
  "cme A 10.60",
  "eles C1 INCI UDED IN TOTAL 2.57",
  "RAY or 16 00 ong 0.00",
].map((text, index) => ({
  text,
  confidence: 62,
  bbox: { x0: 60, y0: index * 42, x1: 760, y1: index * 42 + 30 },
}));

const preferredLines = receiptLinesFromBlocks(
  [{ paragraphs: [{ lines: degradedBlockLines }] }],
  coherentRawText,
);
const preferred = parseReceipt(receiptLinesText(preferredLines), preferredLines);
assert.equal(preferred.retailer, "Coles");
assert.equal(preferred.purchasedAt, "2026-08-09");
assert.equal(preferred.total, 35.6);
assert.equal(preferred.items.length, 8);
assert.equal(preferred.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.equal(preferred.items.some((item) => /Lhe AL|cme A|INCI UDED|RAY or/i.test(item.description)), false);
assert.deepEqual(preferred.warnings, []);

const deployedFragments = `
Coles
Date: 09/08/2026
Description $
ee PEPSL MAK COLA 1 25LITRI 16.00
nr a Le 4 4.00
2 FOR $4.80 -$6.40
COLES SUGAR RAW 2KG 3.20
a RESSO 750ML 750M 4.50
BRIE F BREAK CED COFFE 500M 2.90
BRIER M11 KVBAR CHOC BLOCK 170GRAM 3.75
RRR KITKAT COOKIE DOUGH 170GRAM 3.75
KIT KAT CHUNKY AERO 155GRAM 3.75
a ie AAWALLIAN PIZZA SCROL 2PACK 4.15
Lhe AL 25.00
cme A 10.60
eles C1 INCI UDED IN TOTAL 2.57
RAY or 16 00 ong 0.00
`;
const repairedLines = receiptLinesFromBlocks(undefined, deployedFragments);
assert.equal(repairedLines.some((line) => line.text === "TOTAL $35.60"), true, "split tender payments should recover a missing receipt total");
assert.equal(repairedLines.some((line) => /Lhe AL|cme A|INCI UDED|RAY or/i.test(line.text)), false, "tender, tax and footer fragments must be removed before parsing");
assert.equal(repairedLines.some((line) => line.text === "4 @ $4.00 EACH"), true, "a damaged per-unit line should be repaired from the preceding line total");
assert.equal(classifyReceiptLines(repairedLines).some((line) => line.role === "tax" || line.role === "tender" || line.role === "footer"), false);

const repaired = parseReceipt(receiptLinesText(repairedLines), repairedLines);
assert.equal(repaired.retailer, "Coles");
assert.equal(repaired.purchasedAt, "2026-08-09");
assert.equal(repaired.total, 35.6);
assert.equal(repaired.items.length, 8);
assert.equal(repaired.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.equal(repaired.items.some((item) => /2 FOR|Lhe AL|cme A|INCI UDED|RAY or/i.test(item.description)), false);
assert.deepEqual(repaired.warnings, []);

// Exact PSM 6 OCR captured from the uploaded 09/08/2026 Yamanto receipt photo.
// This is intentionally not cleaned up: the regression protects the production
// path against the damaged leading quantity digit, missing Description label,
// footer date position and two unreadable terminal prices seen in the real image.
const uploadedPhotoPsm6 = `
j ' ckout RO
Receipt ) ‘
f Time: 14:
$
MAX COLA 1.25LITRE 16.00
9 $4.00 EACH ery
@ S0L0 1.25. 2 FOR $4.8 -$6.40
VAR RAW 2KG 3.2
FSSO 750ML 750M. 4.50
AK ICED COFFE 5S00ML 2.90
MILKYBAR CHOC BLOCK 170GRAM 3.75
KI IKE OKIE DOUGH 170GRAM 3 1S
KIT KF HUNKY AERO 155GRAM 3.75
AWAIIAN PIZZA SCROL 2PACK a, 19
tal for 11 items; $35.60
. $25.00
$10.60
GS! INCLUDED IN TOTAL $2 5)
Coles
09/08/26
627349 2
EXPIRY
PURCHASE
BALANCE
RRN 0014
`;
const uploadedPhotoLines = receiptLinesFromBlocks(undefined, uploadedPhotoPsm6);
assert.equal(uploadedPhotoLines.some((line) => line.text === "4 @ $4.00 EACH"), true, "the real OCR's '9 $4.00 EACH' row must be repaired to quantity 4 from the $16.00 line total");
assert.equal(uploadedPhotoLines.some((line) => line.text === "09/08/26"), true, "a footer-position receipt date must survive structural sanitising");
assert.equal(uploadedPhotoLines.some((line) => /ckout RO|f Time/i.test(line.text)), false, "unknown preamble fragments before the price column must not become merchandise");

const uploadedPhoto = parseReceipt(receiptLinesText(uploadedPhotoLines), uploadedPhotoLines);
assert.equal(uploadedPhoto.retailer, "Coles");
assert.equal(uploadedPhoto.purchasedAt, "2026-08-09");
assert.equal(uploadedPhoto.total, 35.6);
assert.equal(uploadedPhoto.items.length, 8);
assert.equal(uploadedPhoto.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.equal(uploadedPhoto.items.filter((item) => item.price === null).length, 2, "unreadable prices should remain blank rather than causing the whole receipt to be discarded");
assert.deepEqual(uploadedPhoto.warnings, []);

console.log("Yamanto production receipt regression checks passed.");
