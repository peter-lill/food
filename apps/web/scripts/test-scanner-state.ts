import assert from "node:assert/strict";
import { createBarcodeDuplicateGuard } from "../src/lib/scanner/duplicate-guard";
import { readFileSync } from "node:fs";

const guard = createBarcodeDuplicateGuard(1_500);

assert.equal(guard.accept("9300605148260", 1_000), true);
assert.equal(guard.accept("9300605148260", 2_499), false);
assert.equal(guard.accept("9300605148260", 2_500), true);
assert.equal(guard.accept(" 9310140005270 ", 2_600), true);
assert.equal(guard.accept("", 2_700), false);

guard.reset();
assert.equal(guard.accept("9300605148260", 2_701), true);

const barcodeRoute = readFileSync(new URL("../src/app/api/products/barcode/[barcode]/route.ts", import.meta.url), "utf8");
assert.match(barcodeRoute, /searchColesAndWoolworthsCatalogue\(barcode\)/, "barcode scanning must query Australian retailer catalogues");
assert.match(barcodeRoute, /barcodeDigits\(candidate\.barcode\) === barcodeDigits\(barcode\)/, "retailer scanner results must require an exact barcode match");

console.log("Scanner duplicate suppression and retailer lookup checks passed.");
