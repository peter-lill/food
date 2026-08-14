import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { explainPilotCandidate, pilotQueryVariants, scorePilotCandidate } from "./coles-pilot-matching";
import type { RetailerCatalogueCandidate } from "../src/lib/prices/coles-woolworths-provider";

const source = readFileSync(new URL("import-coles-pilot.ts", import.meta.url), "utf8");
assert.match(source, /pilotSelections\.length !== 30/, "the pilot must fail unless exactly 30 products are selected");
assert.match(source, /retailers: \["Coles"\]/, "the pilot must query Coles only");
assert.match(source, /candidate\.externalId/, "a retailer product ID must be required");
assert.match(source, /Ambiguous Coles match/, "ambiguous matches must fail rather than import");
assert.match(source, /Candidates inspected:/, "failed production previews must expose actual candidate diagnostics");
assert.match(source, /Competing candidates:/, "ambiguous production previews must expose every competing identity");
assert.match(source, /Promise\.all\(pilotQueryVariants/, "retail synonym searches must be combined before ranking");
assert.match(source, /retailer_externalId/, "existing retailer listings must prevent duplicates");
assert.match(source, /productAlias\.findUnique/, "existing canonical aliases must prevent duplicates");
assert.match(source, /Preview complete\. No database changes were made/, "preview must be the default mode");
assert.match(source, /failures\.push\(message\)/, "validation must collect every failure rather than stop at the first unavailable product");
assert.match(source, /failed for \$\{failures\.length\} of 30 selections\. No database changes were made/, "a partial batch must remain fail-closed");
assert.match(source, /source: "coles-pilot"/, "pilot provenance must be retained");

const candidate = (productName: string, packSize: string): RetailerCatalogueCandidate => ({
  retailer: "Coles", productName, packSize, price: 2, externalId: "test", barcode: null,
  imageUrl: null, sourceUrl: null, isSpecial: false,
});
assert.ok(Number.isFinite(scorePilotCandidate("Coles Light Milk 2L", candidate("Coles Light Milk 2L", "2L"))));
assert.deepEqual(pilotQueryVariants("Coles Light Milk 2L"), [
  "Coles Light Milk 2L", "Coles Lite Milk 2L", "Coles Reduced Fat Milk 2L", "Coles Low Fat Milk 2L",
]);
assert.ok(Number.isFinite(scorePilotCandidate("Coles Light Milk 2L", candidate("Coles Reduced Fat Milk 2L", "2L"))),
  "retailer wording variants must share one matching identity");
assert.ok(
  scorePilotCandidate("Coles Full Cream Milk 2L", candidate("Coles Full Cream Milk 2L", "2L"))
    > scorePilotCandidate("Coles Full Cream Milk 2L", candidate("Coles Full Cream Milk Homogenised 2L", "2L")),
  "an exact normalized product identity must beat a merely similar candidate",
);
assert.equal(scorePilotCandidate("Coles Light Milk 2L", candidate("Coles Simply Light Coconut Milk 400mL", "400mL")), -Infinity,
  "milk must not match coconut milk with a different pack size");
assert.match(explainPilotCandidate("Coles Light Milk 2L", candidate("Coles Simply Light Coconut Milk 400mL", "400mL")).rejection ?? "", /package dimensions/);
assert.equal(scorePilotCandidate("Coles Light Milk 2L", candidate("Coles Light Coconut Milk 2L", "2L")), -Infinity,
  "an unexpected product identity qualifier must be rejected even when the pack size matches");
assert.ok(Number.isFinite(scorePilotCandidate("Coles Lactose Free Full Cream Milk 1L", candidate("Coles Lactose Free Full Cream Milk 1L", "1 L"))));
assert.equal(scorePilotCandidate("Coles Lactose Free Full Cream Milk 1L", candidate("Coles Full Cream Milk 1L", "1L")), -Infinity,
  "required dietary qualifiers must survive matching");
assert.equal(scorePilotCandidate("Coles Lactose Free Full Cream Milk 1L", candidate("Coles Lactose Free Full Cream Milk 2L", "2L")), -Infinity,
  "different package sizes must not compete as ambiguous matches");
assert.ok(Number.isFinite(scorePilotCandidate("Coles Free Range Eggs 12 Pack 700g", candidate("Coles Free Range Eggs 12 Pack 700g", "12 Pack"))),
  "count and total weight may be combined from the retailer name and package field");
assert.equal(scorePilotCandidate("Coles Free Range Eggs 12 Pack 700g", candidate("Coles Free Range Eggs 12 Pack 600g", "12 Pack")), -Infinity,
  "an otherwise identical count pack with a different total weight must be rejected");
assert.notEqual(
  explainPilotCandidate(
    "Soothers Butter Menthol Liquid Centre Honey Lemon Throat Lozenges 10 Pack",
    candidate("Soothers Butter Menthol Liquid Centre Honey Lemon Throat Lozenges 10 Pack", "10 Pack"),
  ).rejection,
  "conflicting identity: oat",
  "identity terms must match whole words and never detect oat inside throat",
);
console.log("Coles 30-product pilot safeguards passed.");
