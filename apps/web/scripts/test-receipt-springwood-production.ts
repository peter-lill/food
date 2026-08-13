import assert from "node:assert/strict";
import { parseReceipt } from "../src/lib/receipts/engine/parser";
import { canPopulateReceiptCandidate, chooseReceiptCandidate } from "../src/lib/receipts/receipt-ocr-selection";
import { receiptLinesFromBlocks, receiptLinesText } from "../src/lib/receipts/receipt-structure";

// Based on OCR from the real 29 July 2026 Coles Springwood receipt. The source
// image is readable to a person, but the OCR drops some right-column prices,
// returns one-decimal prices on several lines, and can lose the minus sign on
// the free-container redemption. Those defects must not delete products or
// turn the redemption into another purchase.
const springwoodOcr = `
Coles
Date: 29/07/2026
Description $
ATLUX LIGHT CLUMPIN 6LITRE
LES LACTOSE FREE 2LITRE
*FOOD STORAGE 4PACK 6 .O
VANILLA COKE 1.25 LT 1.25LITRE 5.0
2 @ $2.50 EACH
ROKEBY PROTEIN SNACK 160GRAM 1.50
ROKEBY PROTEIN SNACK 160GRAM 1.50
COLES THICKENED CREM 300ML 3.40
COLES TUNA W CRACKER 112GRAM 2.10
COLES TUNA SWEETCORN 95G 1.10
SIRENA TUNA GARLIC 95GRAM 2.30
CADBURY BUBBLY BLOCK 160GRAM 4.8
SLICED MUSHROOMS 500GRAM 6.09
COLES BEEF SCOTCH 480GRAM 23.00
CFINEST BEEF BURGER 600GRAM 7.7
COLES IBUPROFEN TABS 24PACK 3.10
2 @ $1.55 EACH
MINI GLASS CONTAINER 2PACK 24.00
REDEEMED FREE $24 00
lote!l for 18 items $81.64
GST INCLUDED IN TOTAL $2.45
EFT $81.64
`;

const lines = receiptLinesFromBlocks(undefined, springwoodOcr);
const text = receiptLinesText(lines);
const parsed = parseReceipt(text, lines);

assert.equal(parsed.retailer, "Coles");
assert.equal(parsed.purchasedAt, "2026-07-29");
assert.equal(parsed.total, 81.64);
assert.equal(parsed.items.length, 16);
assert.equal(parsed.items.reduce((sum, item) => sum + item.quantity, 0), 18);
assert.deepEqual(parsed.warnings, []);

const vanilla = parsed.items.find((item) => /VANILLA COKE/i.test(item.description));
assert.ok(vanilla);
assert.equal(vanilla.quantity, 2);
assert.equal(vanilla.price, 5, "the 2 @ $2.50 quantity row must override a stray pack-size/one-decimal amount");

const ibuprofen = parsed.items.find((item) => /IBUPROFEN/i.test(item.description));
assert.ok(ibuprofen);
assert.equal(ibuprofen.quantity, 2);
assert.equal(ibuprofen.price, 3.1);

assert.equal(parsed.items.some((item) => /REDEEMED FREE/i.test(item.description)), false, "a free redemption is an adjustment, not merchandise");
assert.equal(parsed.items.some((item) => Math.abs((item.price ?? 0) - 24) < 0.001 && /REDEEMED/i.test(item.description)), false);

const catLitter = parsed.items.find((item) => /ATLUX LIGHT CLUMPIN/i.test(item.description));
const lactoseMilk = parsed.items.find((item) => /LACTOSE FREE/i.test(item.description));
assert.ok(catLitter);
assert.ok(lactoseMilk);
assert.equal(catLitter.price, null, "a readable product must survive when OCR loses only its price");
assert.equal(lactoseMilk.price, null, "a readable product must survive when OCR loses only its price");

const candidate = { ocrConfidence: 74, parsed, pass: "structured" as const, text, lines };
assert.equal(canPopulateReceiptCandidate(candidate), true, "the reconciled 18-unit Springwood receipt should populate review");

// Exact SINGLE_BLOCK OCR reproduced from the clearer Springwood phone image
// supplied on 13 August 2026. Full-page segmentation drops the printed
// `2 @ $1.55 EACH` row below Ibuprofen and splits `MINI GLASS CONTAINER` across
// two OCR rows. Geometry still shows a doubled row gap after Ibuprofen. The
// structural candidate repair should merge the split product and use the
// receipt's 18-item count plus that doubled gap to restore quantity 2, rather
// than accepting a fake 17th purchase line.
const exactSpringwoodPhotoOcr = `
) Ltd
cojee Supermarket fue tia' 169 708
€ 147; CS SPRINGWOOD
: e Manager; Steve
Phone 28896300
Served Ry ssisted Checkou
Rec ater Te ye ‘ Reve prt 8772
ate 29/07/2026 Time; 17:19
Description $
% CATLUX LIGHT CLUMPIN 6LITRE 9.00
COLES LACTOSE FREE 2LITRE 5.05
x8FOOD STORAGE 4PACK 6.00
*RVANILLA COKE 1.25 LT 1.25LITRE 5.00
2 @ $2.50 EACH
* RUKEBY PROTEIN’ SNACK 160GRAM 1.50
» ROKEBY PROTEIN SNACK 160GRAM 1.50
COLES THICKENED CREM 3O0ML 3.40
% COLES TUNA W CRACKER 112GP4M 2.10
COLES TUNA SWEETCORN 95C; 1.10
» SIRENA TUNA GARLIC 95GRA\. 2.30
*#CADBURY BUBBLY BLOCK 160GRAM 4.80
SLICED MUSHROOMS SOOGRAM 6.09
COLES BEEF SCOTCH 480GRAM 23.00
CFINEST BEEF BURGER 600GRAM 7.70
COLES IBUPROFEN TABS 24PACK 3.10
x MINI (LASS NTA
> CONTAINER 2PACK 24.00
REDEEMED FREE ~$24 00
Total for 18 items: $81.64
EFT
ive 81.64
GST INCLUDED IN TOTAL 2S
Coles é QLD AU
21/28 4 19 44785366 _NQ72B7
`;

let photoY = 20;
const exactPhotoLines = exactSpringwoodPhotoOcr.trim().split(/\r?\n/).filter(Boolean).map((line) => {
  const currentY = photoY;
  photoY += /IBUPROFEN/i.test(line) ? 72 : 36;
  return { text: line, confidence: 82, bbox: { x0: 20, y0: currentY, x1: 820, y1: currentY + 28 } };
});
const exactPhotoText = receiptLinesText(exactPhotoLines);
const exactPhotoParsed = parseReceipt(exactPhotoText, exactPhotoLines);
const exactPhotoCandidate = { ocrConfidence: 82, parsed: exactPhotoParsed, pass: "structured" as const, text: exactPhotoText, lines: exactPhotoLines };
const exactPhotoSelected = chooseReceiptCandidate([exactPhotoCandidate]);
assert.ok(exactPhotoSelected);
assert.equal(exactPhotoSelected.parsed.retailer, "Coles");
assert.equal(exactPhotoSelected.parsed.purchasedAt, "2026-07-29");
assert.equal(exactPhotoSelected.parsed.total, 81.64);
assert.equal(exactPhotoSelected.parsed.items.length, 16, "split MINI GLASS CONTAINER OCR must collapse back to one purchase line");
assert.equal(exactPhotoSelected.parsed.items.reduce((sum, item) => sum + item.quantity, 0), 18);
assert.equal(exactPhotoSelected.parsed.items.some((item) => item.price === null), false, "the split Mini Glass fragment must not survive as an unpriced fake item");
const exactIbuprofen = exactPhotoSelected.parsed.items.find((item) => /IBUPROFEN/i.test(item.description));
assert.ok(exactIbuprofen);
assert.equal(exactIbuprofen.quantity, 2, "the missing Ibuprofen quantity row should be recovered from item count plus the doubled line gap");
const exactMiniGlass = exactPhotoSelected.parsed.items.find((item) => /MINI.*CONTAINER/i.test(item.description));
assert.ok(exactMiniGlass);
assert.equal(exactMiniGlass.price, 24);
assert.equal(canPopulateReceiptCandidate(exactPhotoSelected), true);

console.log("Springwood production receipt regression passed: 16 purchase lines / 18 units / $81.64.");
