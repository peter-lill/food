import assert from "node:assert/strict";
import { matchReceiptProduct, type ReceiptProductCandidate } from "../src/lib/receipts/receipt-product-match";

const candidates: ReceiptProductCandidate[] = [
  { id: "pepsi", name: "Pepsi Max Cola No Sugar Soft Drink Bottle", canonicalName: "Pepsi Max Cola", brand: "Pepsi", packSize: "1.25L" },
  { id: "sugar", name: "Coles Raw Sugar", canonicalName: "Coles Raw Sugar", packSize: "2kg" },
  { id: "coffee", name: "Ice Break Iced Coffee", canonicalName: "Ice Break Iced Coffee", packSize: "500ml" },
  { id: "dare", name: "Dare Espresso Iced Coffee", canonicalName: "Dare Espresso", packSize: "750ml" },
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
  ["KIT KAT CHUNKY AERO 135GRAM", "aero"],
  ["5F FPST MAX COLA 1 25LITRE", "pepsi"],
  ["5 SUGAR RAW 2KG", "sugar"],
  ["ARE ESPRESSO 750ML 750ML", "dare"],
  ["ICE BREAK ICED COFFE S000ML", "coffee"],
  ["4MILKYBAR CHOC BLOCK 170GRAM", "milkybar"],
  ["ve K11kAT COOKIE DOUGH 170GRAM", "cookie"],
] as const;

for (const [ocr, expected] of cases) assert.equal(matchReceiptProduct(ocr, candidates)?.productId, expected, ocr);
assert.equal(matchReceiptProduct("KIT KAT CHUNKY", candidates), null, "Ambiguous wording without a readable pack size must be preserved");
assert.equal(matchReceiptProduct("COLES PRODUCT", candidates), null, "Weak matches must be preserved");
assert.equal(matchReceiptProduct("KIT KAT CHUNKY AERO 155GRAM", [
  { id: "invented-mint", name: "KitKat Aero Mint Chocolate Block", canonicalName: "KitKat Aero Mint Chocolate Block", packSize: "155g" },
]), null, "catalogue matching must not invent a flavour absent from the receipt");
console.log("Receipt catalogue product matching tests passed.");
