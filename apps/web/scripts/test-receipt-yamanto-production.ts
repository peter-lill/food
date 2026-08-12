import assert from "node:assert/strict";
import { parseReceipt } from "../src/lib/receipts/engine/parser";
import { canPopulateReceiptCandidate, chooseReceiptCandidate, receiptCandidatePopulationProblems } from "../src/lib/receipts/receipt-ocr-selection";
import {
  classifyReceiptLines,
  receiptLineCandidatesFromOcr,
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

const uploadedPhotoCandidate = {
  ocrConfidence: 61,
  parsed: uploadedPhoto,
  pass: "structured" as const,
  text: receiptLinesText(uploadedPhotoLines),
  lines: uploadedPhotoLines,
};
assert.equal(canPopulateReceiptCandidate(uploadedPhotoCandidate), true, `actual camera OCR should populate: ${receiptCandidatePopulationProblems(uploadedPhotoCandidate).join(", ")}`);

// Browser Tesseract exposes both aggregate text and geometry-backed block lines.
// A photographed receipt can have a fragmented aggregate result while its block
// representation remains coherent, so candidate selection must evaluate both.
const fragmentedAggregate = `Coles\nDescription $\nPEPSI MAX 16.00\n11 items\n$35\n60`;
const ocrVariants = receiptLineCandidatesFromOcr(
  [{ paragraphs: [{ lines: uploadedPhotoPsm6.split(/\r?\n/).filter(Boolean).map((text, index) => ({
    text,
    confidence: 61,
    bbox: { x0: 40, y0: index * 32, x1: 760, y1: index * 32 + 24 },
  })) }] }],
  fragmentedAggregate,
);
assert.equal(ocrVariants.length, 2, "aggregate and geometry OCR representations should both become candidates");
const browserCandidates = ocrVariants.map((lines) => {
  const text = receiptLinesText(lines);
  return { ocrConfidence: 61, parsed: parseReceipt(text, lines), pass: "structured" as const, text, lines };
});
const selectedBrowserCandidate = chooseReceiptCandidate(browserCandidates);
assert.ok(selectedBrowserCandidate);
assert.equal(canPopulateReceiptCandidate(selectedBrowserCandidate), true);
assert.equal(selectedBrowserCandidate.parsed.retailer, "Coles");
assert.equal(selectedBrowserCandidate.parsed.purchasedAt, "2026-08-09");
assert.equal(selectedBrowserCandidate.parsed.total, 35.6);
assert.equal(selectedBrowserCandidate.parsed.items.length, 8);
assert.equal(selectedBrowserCandidate.parsed.items.reduce((sum, item) => sum + item.quantity, 0), 11);

console.log("Yamanto camera candidates", browserCandidates.map((candidate) => ({
  retailer: candidate.parsed.retailer,
  date: candidate.parsed.purchasedAt,
  total: candidate.parsed.total,
  lines: candidate.parsed.items.length,
  units: candidate.parsed.items.reduce((sum, item) => sum + item.quantity, 0),
  warnings: candidate.parsed.warnings,
  populationProblems: receiptCandidatePopulationProblems(candidate),
  selected: candidate === selectedBrowserCandidate,
})));

// Exact SINGLE_BLOCK aggregate OCR captured from the PNG supplied after PR #149.
// Its retailer name appears only as the damaged footer word "Colgg" and its
// quantity row lacks both a readable leading digit and @ symbol.
const liveDeployedPsm6 = `
| ckout =O
Receipt ) 4
¢ Time: 14:4
$
MAX COLA 1.25LTTRE 16.00
a $4.00 EACH Be
¢ S000 1.25. 2 FOR $4.8 _ $6.40
JAR RAW 2KG 3.2
£SS0 750M 750ML 4.50
AK ICED COFFE 500M. 2.90
MILKYBAR CHOC BLOCK 170GRAM 3.75
KITK# JOKIE DOUGH 170GRAM 3 J
KIT Kf HUNKY AERO 155GRAM 3.79
AWAITAN PIZZA SCROL 2PACK 4.19
tal for 11 items; $35.60
: $25.00
j $10.60
GST INCLUDED IN TOIAl $2 57
Colgg
09/08/26
627340 2
EXPIRY
PURCHASE
BALANCE
RRN 001 4
`;
const liveDeployedLines = receiptLinesFromBlocks(undefined, liveDeployedPsm6);
assert.equal(liveDeployedLines.some((line) => line.text === "Colgg"), true, "an OCR-damaged retailer identity after the total must survive sanitising");
const liveDeployed = parseReceipt(receiptLinesText(liveDeployedLines), liveDeployedLines);
const liveDeployedCandidate = { ocrConfidence: 74, parsed: liveDeployed, pass: "structured" as const, text: receiptLinesText(liveDeployedLines), lines: liveDeployedLines };
assert.equal(liveDeployed.retailer, "Coles");
assert.equal(liveDeployed.purchasedAt, "2026-08-09");
assert.equal(liveDeployed.total, 35.6);
assert.equal(liveDeployed.items.length, 8);
assert.equal(liveDeployed.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.deepEqual(liveDeployed.warnings, []);
assert.equal(canPopulateReceiptCandidate(liveDeployedCandidate), true, `exact live PNG candidate should populate: ${receiptCandidatePopulationProblems(liveDeployedCandidate).join(", ")}`);

// Exact SINGLE_BLOCK OCR from the complete phone-camera image supplied after
// PR #154. The Description heading gained debris on both sides, which previously
// allowed store/register/date preamble rows to become nine fake products.
const completePhonePhoto = `
Seta oles Supermarkets Australia pty Ltd
I I Rice ABN I 004 189 708 .
s Store: 4089 CS YAMANTO
- Store Manage Jamie B '
JIE 07 3173 6300 Ly
I Ccrved Bye Assisted Checkout Ba
I Register: 116 Receipt: 99
JES 09/08/2026 Time: 14:20 f -
5 Description $ Lids -
BE: coc MAX COLA 1.25LTTRE 16.00 a
4 @ $4.00 EACH
PEPST OR SOLO 1.25.2 FOR $4.8 -$6.40
LES SUGAR RAW 2KG 3.20 a
DARE ESPRESSO 750ML 750ML 4.50
T1CE BREAK ICED COFFE 500ML 2.90
MIL KYRAR CHOC BLOCK 170GRAM 3.75
4KITKAT COOKIE DOUGH 170GRAM 3.19
BN iKTT KAT CHUNKY AERO 1S5GRAM 3.75
HAWAIIAN PIZZA SCROL 2PACK 4.15
lotal for 11 items: $35.60
EF] $25.00
EF] $10.60
GST INCLUDED IN TOTAL $2.57
Coles
09/08/26
`;
const completePhoneLines = receiptLinesFromBlocks(undefined, completePhonePhoto);
const completePhoneParsed = parseReceipt(receiptLinesText(completePhoneLines), completePhoneLines);
const completePhoneCandidate = { ocrConfidence: 53, parsed: completePhoneParsed, pass: "structured" as const, text: receiptLinesText(completePhoneLines), lines: completePhoneLines };
assert.equal(completePhoneParsed.items.some((item) => /Store Manage|Assisted Checkout|Register|Receipt: 99|Description/i.test(item.description)), false, "preamble above a damaged Description heading must not become products");
assert.equal(completePhoneParsed.retailer, "Coles");
assert.equal(completePhoneParsed.purchasedAt, "2026-08-09");
assert.equal(completePhoneParsed.total, 35.6);
assert.equal(completePhoneParsed.items.length, 8);
assert.equal(completePhoneParsed.items.reduce((sum, item) => sum + item.quantity, 0), 11);
assert.match(completePhoneParsed.warnings.join("\n"), /differs from the receipt total/, "one OCR-damaged price should remain explicitly reviewable");
assert.equal(canPopulateReceiptCandidate(completePhoneCandidate), true, `complete phone photo should populate: ${receiptCandidatePopulationProblems(completePhoneCandidate).join(", ")}`);

console.log("Yamanto production receipt regression checks passed.");
