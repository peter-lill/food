import assert from "node:assert/strict";
import { parseReceipt } from "../src/lib/receipts/engine/parser";
import { canPopulateReceiptCandidate } from "../src/lib/receipts/receipt-ocr-selection";
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

console.log("Springwood production receipt regression passed: 16 purchase lines / 18 units / $81.64.");
