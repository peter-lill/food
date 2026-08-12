import assert from "node:assert/strict";
import { matchReceiptProduct, type ReceiptProductCandidate } from "../src/lib/receipts/receipt-product-match";

const candidates: ReceiptProductCandidate[] = [
  { id: "pepsi", name: "Pepsi Max Cola No Sugar Soft Drink Bottle", canonicalName: "Pepsi Max Cola", brand: "Pepsi", packSize: "1.25L" },
  { id: "sugar", name: "Coles Raw Sugar", canonicalName: "Coles Raw Sugar", packSize: "2kg" },
  { id: "coffee", name: "Ice Break Iced Coffee", canonicalName: "Ice Break Iced Coffee", packSize: "500ml" },
  { id: "milkybar", name: "Milkybar White Chocolate Block", canonicalName: "Milkybar Chocolate Block", packSize: "170g" },
  { id: "cookie", name: "KitKat Cookie Dough Chocolate Block", canonicalName: "KitKat Cookie Dough", packSize: "170g" },
  { id: "aero", name: "KitKat Chunky Aero Mint Chocolate Bar", canonicalName: "KitKat Chunky Aero", packSize: "155g" },
  { id: "other-aero", name: "KitKat Chunky Aero", canonicalName: "KitKat Chunky Aero", packSize: "45g" },
];

const cases = [
  ["PEPST MAX COLA 1.25LITRE", "pepsi"],
  ["LES SUGAR RAW 2KG", "sugar"],
  ["T1CE BREAK ICED COFFE 500ML", "coffee"],
  ["MIL KYRAR CHOC BLOCK 170GRAM", "milkybar"],
  ["4KITKAT COOKIE DOUGH 170GRAM", "cookie"],
  ["iKTT KAT CHUNKY AERO 1S5GRAM", "aero"],
] as const;

for (const [ocr, expected] of cases) assert.equal(matchReceiptProduct(ocr, candidates)?.productId, expected, ocr);
assert.equal(matchReceiptProduct("KIT KAT CHUNKY", candidates), null, "Ambiguous wording without a readable pack size must be preserved");
assert.equal(matchReceiptProduct("COLES PRODUCT", candidates), null, "Weak matches must be preserved");
console.log("Receipt catalogue product matching tests passed.");
