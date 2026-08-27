import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReceiptVisionOutput } from "../src/lib/receipts/receipt-vision-output";
import { receiptVisionRequest } from "../src/lib/receipts/receipt-vision-request";
import { receiptVisionCropRegions, receiptVisionImageUrls } from "../src/lib/receipts/receipt-vision-images";
import { parseReceipt } from "../src/lib/receipts/engine/parser";
import { canPopulateReceiptCandidate, chooseReceiptCandidate } from "../src/lib/receipts/receipt-ocr-selection";
import { receiptLineCandidatesFromOcr, receiptLinesText } from "../src/lib/receipts/receipt-structure";

async function main() {
const valid = parseReceiptVisionOutput({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
  lines: ["Coles", "COLES MILK 2L 4.50", "BREAD 3.20", "EGGS 5.00", "Total $12.70"],
  confidence: 88,
}) }] }] });
assert.deepEqual(valid, { text: "Coles\nCOLES MILK 2L 4.50\nBREAD 3.20\nEGGS 5.00\nTotal $12.70", confidence: 88 });
assert.equal(parseReceiptVisionOutput({ output_text: "not json" }), null);
assert.equal(parseReceiptVisionOutput({ output_text: JSON.stringify({ lines: ["Coles"], confidence: 90 }) }), null);
assert.deepEqual(parseReceiptVisionOutput({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify({ lines: ["Coles", "MILK 4.00", "Total $4.00"], confidence: 84 })}\n\`\`\`` } }] }), {
  text: "Coles\nMILK 4.00\nTotal $4.00",
  confidence: 84,
}, "OpenAI-compatible chat completions and fenced JSON must be accepted");
const imageUrls = ["data:image/jpeg;base64,overview", "data:image/jpeg;base64,top", "data:image/jpeg;base64,middle", "data:image/jpeg;base64,bottom"];
const aiComputeRequest = receiptVisionRequest("aicompute", "gemma-4-31b-it", imageUrls);
assert.equal(aiComputeRequest.endpoint, "chat/completions");
assert.equal(aiComputeRequest.body.model, "gemma-4-31b-it");
assert.ok(aiComputeRequest.body.messages);
assert.deepEqual(aiComputeRequest.body.messages[0].content[1], {
  type: "image_url",
  image_url: { url: "data:image/jpeg;base64,overview", detail: "high" },
});
assert.equal(aiComputeRequest.body.messages[0].content.length, 5, "the overview and all close-up tiles must reach AI Compute");
assert.deepEqual(receiptVisionCropRegions(1_000, 4_000), [
  { left: 0, top: 0, width: 1_000, height: 1_680 },
  { left: 0, top: 1_160, width: 1_000, height: 1_680 },
  { left: 0, top: 2_320, width: 1_000, height: 1_680 },
], "a tall receipt must be split into overlapping top, middle and bottom close-ups");
assert.deepEqual(receiptVisionCropRegions(1_600, 1_200), [], "ordinary landscape images must not be needlessly tiled");
const syntheticReceipt = new File([
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="4000"><rect width="1000" height="4000" fill="white"/><text x="80" y="180" font-size="64">COLES RECEIPT</text><text x="80" y="2100" font-size="52">PRODUCT ROW 4.50</text><text x="80" y="3850" font-size="64">TOTAL 35.60</text></svg>'),
], "receipt.svg", { type: "image/svg+xml" });
const preparedImages = await receiptVisionImageUrls(syntheticReceipt);
assert.equal(preparedImages.length, 4, "a tall receipt must produce one overview and three close-up images");
assert.equal(preparedImages.every((url) => url.startsWith("data:image/jpeg;base64,")), true, "all model inputs must be normalised JPEG data URLs");

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
const visionSource = readFileSync(new URL("../src/lib/receipts/receipt-vision.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/components/receipts/ReceiptWorkspace.tsx", import.meta.url), "utf8");
assert.match(routeSource, /isOwnerEmail\(session\.user\.email\)/, "server receipt OCR must require the owner session");
assert.match(routeSource, /status: 503/, "a missing provider must not be reported to the browser as a successful empty recognition");
assert.match(routeSource, /status: 502/, "an upstream vision failure must not be reported as a successful empty recognition");
assert.match(visionSource, /configuredProvider\("aicompute"\)/, "receipt vision must use the already configured AI Compute provider when OpenAI is absent");
assert.match(workspaceSource, /fetch\("\/api\/receipts\/recognise"/, "the receipt workspace must request optional server recognition");
assert.match(workspaceSource, /pass:\s*"vision"/, "vision output must enter the same deterministic candidate selector");
assert.match(workspaceSource, /Server recognition failed; check AI provider status/, "the review UI must explain a failed server fallback instead of silently returning no receipt");

console.log("Receipt vision fallback checks passed.");
}

void main();
