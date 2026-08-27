import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReceiptVisionOutput } from "../src/lib/receipts/receipt-vision-output";
import { parseReceipt } from "../src/lib/receipts/engine/parser";
import { canPopulateReceiptCandidate, chooseReceiptCandidate } from "../src/lib/receipts/receipt-ocr-selection";
import { receiptLineCandidatesFromOcr, receiptLinesText } from "../src/lib/receipts/receipt-structure";

const valid = parseReceiptVisionOutput({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
  lines: ["Coles", "COLES MILK 2L 4.50", "BREAD 3.20", "EGGS 5.00", "Total $12.70"],
  confidence: 88,
}) }] }] });
assert.deepEqual(valid, { text: "Coles\nCOLES MILK 2L 4.50\nBREAD 3.20\nEGGS 5.00\nTotal $12.70", confidence: 88 });
assert.equal(parseReceiptVisionOutput({ output_text: "not json" }), null);
assert.equal(parseReceiptVisionOutput({ output_text: JSON.stringify({ lines: ["Coles"], confidence: 90 }) }), null);

const yamantoVision = parseReceiptVisionOutput({ output_text: JSON.stringify({
  lines: [
    "Coles Supermarkets Australia Pty Ltd", "Date: 09/08/2026", "Description $",
    "PEPSI MAX COLA 1.25LITRE 16.00", "4 @ $4.00 EACH", "PEPSI OR SOLO 1.25L 2 FOR $4.80 -$6.40",
    "COLES SUGAR RAW 2KG 3.20", "DARE ESPRESSO 750ML 4.50", "ICE BREAK ICED COFFEE 500ML 2.90",
    "MILKYBAR CHOC BLOCK 170GRAM 3.75", "KITKAT COOKIE DOUGH 170GRAM 3.75",
    "KIT KAT CHUNKY AERO 155GRAM 3.75", "HAWAIIAN PIZZA SCROL 2PACK 4.15",
    "Total for 11 items: $35.60", "EFT $25.00", "EFT $10.60", "GST INCLUDED IN TOTAL $2.57",
  ],
  confidence: 91,
}) });
assert.ok(yamantoVision);
const visionLines = receiptLineCandidatesFromOcr(undefined, yamantoVision.text)[0] ?? [];
const visionText = receiptLinesText(visionLines);
const visionCandidate = {
  ocrConfidence: yamantoVision.confidence,
  parsed: parseReceipt(visionText, visionLines),
  pass: "vision" as const,
  text: visionText,
  lines: visionLines,
};
const noisyCandidate = {
  ...visionCandidate,
  ocrConfidence: 99,
  pass: "structured" as const,
  parsed: parseReceipt("Coles\nBEE 0 CO 0 1.25 16.00\nhe es ee SUGAR RAW 2kg 4.50"),
  text: "Coles\nBEE 0 CO 0 1.25 16.00\nhe es ee SUGAR RAW 2kg 4.50",
  lines: undefined,
};
const selected = chooseReceiptCandidate([noisyCandidate, visionCandidate]);
assert.equal(selected?.pass, "vision", "a reconciled vision candidate must beat high-confidence fragmented OCR");
assert.equal(canPopulateReceiptCandidate(visionCandidate), true);
assert.equal(visionCandidate.parsed.retailer, "Coles");
assert.equal(visionCandidate.parsed.purchasedAt, "2026-08-09");
assert.equal(visionCandidate.parsed.total, 35.6);
assert.equal(visionCandidate.parsed.items.length, 8);
assert.equal(visionCandidate.parsed.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.equal(visionCandidate.parsed.items.some((item) => /EFT|GST|Total for/i.test(item.description)), false);

const routeSource = readFileSync(new URL("../src/app/api/receipts/recognise/route.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/components/receipts/ReceiptWorkspace.tsx", import.meta.url), "utf8");
assert.match(routeSource, /isOwnerEmail\(session\.user\.email\)/, "server receipt OCR must require the owner session");
assert.match(workspaceSource, /fetch\("\/api\/receipts\/recognise"/, "the receipt workspace must request optional server recognition");
assert.match(workspaceSource, /pass:\s*"vision"/, "vision output must enter the same deterministic candidate selector");

console.log("Receipt vision fallback checks passed.");
