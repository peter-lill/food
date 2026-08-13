import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scorePilotCandidate } from "./coles-pilot-matching";
import type { RetailerCatalogueCandidate } from "../src/lib/prices/coles-woolworths-provider";

const source = readFileSync(new URL("import-coles-pilot.ts", import.meta.url), "utf8");
assert.match(source, /pilotSelections\.length !== 30/, "the pilot must fail unless exactly 30 products are selected");
assert.match(source, /retailers: \["Coles"\]/, "the pilot must query Coles only");
assert.match(source, /candidate\.externalId/, "a retailer product ID must be required");
assert.match(source, /Ambiguous Coles match/, "ambiguous matches must fail rather than import");
assert.match(source, /retailer_externalId/, "existing retailer listings must prevent duplicates");
assert.match(source, /productAlias\.findUnique/, "existing canonical aliases must prevent duplicates");
assert.match(source, /Preview complete\. No database changes were made/, "preview must be the default mode");
assert.match(source, /source: "coles-pilot"/, "pilot provenance must be retained");

const candidate = (productName: string, packSize: string): RetailerCatalogueCandidate => ({
  retailer: "Coles", productName, packSize, price: 2, externalId: "test", barcode: null,
  imageUrl: null, sourceUrl: null, isSpecial: false,
});
assert.ok(Number.isFinite(scorePilotCandidate("Coles Light Milk 2L", candidate("Coles Light Milk 2L", "2L"))));
assert.equal(scorePilotCandidate("Coles Light Milk 2L", candidate("Coles Simply Light Coconut Milk 400mL", "400mL")), -Infinity,
  "milk must not match coconut milk with a different pack size");
assert.equal(scorePilotCandidate("Coles Light Milk 2L", candidate("Coles Light Coconut Milk 2L", "2L")), -Infinity,
  "an unexpected product identity qualifier must be rejected even when the pack size matches");
assert.ok(Number.isFinite(scorePilotCandidate("Coles Lactose Free Full Cream Milk 1L", candidate("Coles Lactose Free Full Cream Milk 1L", "1 L"))));
assert.equal(scorePilotCandidate("Coles Lactose Free Full Cream Milk 1L", candidate("Coles Full Cream Milk 1L", "1L")), -Infinity,
  "required dietary qualifiers must survive matching");
assert.equal(scorePilotCandidate("Coles Lactose Free Full Cream Milk 1L", candidate("Coles Lactose Free Full Cream Milk 2L", "2L")), -Infinity,
  "different package sizes must not compete as ambiguous matches");
console.log("Coles 30-product pilot safeguards passed.");
