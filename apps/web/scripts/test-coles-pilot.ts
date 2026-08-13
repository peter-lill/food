import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("import-coles-pilot.ts", import.meta.url), "utf8");
assert.match(source, /pilotSelections\.length !== 30/, "the pilot must fail unless exactly 30 products are selected");
assert.match(source, /retailers: \["Coles"\]/, "the pilot must query Coles only");
assert.match(source, /candidate\.externalId/, "a retailer product ID must be required");
assert.match(source, /candidate\.packSize/, "a retailer pack size must be required");
assert.match(source, /candidate\.price === null/, "a positive retailer price must be required");
assert.match(source, /coverage < 0\.75/, "weak product-name matches must be rejected");
assert.match(source, /Ambiguous Coles match/, "ambiguous matches must fail rather than import");
assert.match(source, /retailer_externalId/, "existing retailer listings must prevent duplicates");
assert.match(source, /productAlias\.findUnique/, "existing canonical aliases must prevent duplicates");
assert.match(source, /Preview complete\. No database changes were made/, "preview must be the default mode");
assert.match(source, /source: "coles-pilot"/, "pilot provenance must be retained");
console.log("Coles 30-product pilot safeguards passed.");
