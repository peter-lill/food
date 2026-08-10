import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { imageCandidateSourcePriority } from "../src/lib/products/image-intelligence";
import {
  authoritativeRetailerName,
  identityScore,
  retailerSearchQuery,
  retailersNeedRefresh,
} from "../src/lib/retailers/retailer-intelligence.service";

assert.equal(retailersNeedRefresh([]), true);
assert.equal(retailersNeedRefresh(["Woolworths"]), true);
assert.equal(retailersNeedRefresh(["Coles"]), true);
assert.equal(retailersNeedRefresh(["Coles", "Woolworths"]), false);
assert.equal(retailersNeedRefresh(["Coles", "Woolworths", "Coles"]), false);

const milkyBar = {
  id: "milky-bar",
  name: "Milky bar",
  canonicalName: "Milky bar",
  brand: "Nestlé",
  barcode: "9300605161948",
  packSize: "170 g",
  imageUrl: null,
};
assert.equal(
  retailerSearchQuery(milkyBar),
  "9300605161948",
  "the shared retailer search query uses the exact barcode for every retailer",
);
assert.equal(identityScore(milkyBar, {
  retailer: "Coles",
  productName: "Milkybar White Choc Block 170g",
  price: 3.75,
  packSize: "170 g",
  isSpecial: true,
  sourceUrl: "https://www.coles.com.au/product/wrong",
  externalId: "wrong",
  barcode: "9300605000000",
  imageUrl: "https://example.com/wrong.jpg",
}), Number.NEGATIVE_INFINITY, "a name match must never override a conflicting barcode");
const retailerAuthoritySource = readFileSync(new URL("../src/lib/retailers/retailer-intelligence.service.ts", import.meta.url), "utf8");
assert.match(retailerAuthoritySource, /conflictingExternalIds/, "a discovered barcode conflict must deactivate the stale retailer listing");
assert.match(retailerAuthoritySource, /data: \{ active: false \}/, "conflicting listings must not remain available for price comparison");
const underDetailedQueueSource = readFileSync(new URL("enqueue-underdetailed-retailer-products.ts", import.meta.url), "utf8");
assert.match(underDetailedQueueSource, /listingTokens\.length > productTokens\.length/, "a more detailed linked retailer name must trigger an authority refresh");
assert.match(underDetailedQueueSource, /force: true/, "under-detailed barcode products must bypass the freshness window");
assert.equal(
  authoritativeRetailerName("Milky bar", "Nestle Milkybar Nesquik Strawberry Block 170g", true),
  "Nestle Milkybar Nesquik Strawberry Block",
  "an exact retailer barcode match should upgrade an underspecified product name",
);
assert.equal(
  authoritativeRetailerName("Milky bar", "Milkybar White Choc Block 170g", false),
  "Milky bar",
  "a non-barcode name match must not rewrite product identity",
);

assert.ok(imageCandidateSourcePriority("Coles") > imageCandidateSourcePriority("manufacturer"));
assert.ok(imageCandidateSourcePriority("manufacturer") > imageCandidateSourcePriority("Open Food Facts"));
assert.ok(imageCandidateSourcePriority("Open Food Facts") > imageCandidateSourcePriority("Current/manual image"));

const imageRecoverySource = readFileSync(new URL("../src/lib/products/image-recovery.ts", import.meta.url), "utf8");
assert.match(imageRecoverySource, /product\.productType === "GENERIC_PRODUCE"/, "a missing brand or barcode must not make a packaged snack generic");
assert.match(imageRecoverySource, /searchColesAndWoolworthsCatalogue\(barcode\)/, "known barcodes should search retailer catalogues directly");
assert.match(imageRecoverySource, /linkedRetailerImages/, "existing retailer listings should provide replacement image candidates");
assert.match(imageRecoverySource, /candidateSelectionPriority\(right\.candidate\)/, "all usable images should be ranked before selection");

const retailerQueueSource = readFileSync(new URL("enqueue-product-retailer-enrichment.ts", import.meta.url), "utf8");
assert.match(retailerQueueSource, /process\.argv\.includes\("--all"\)/, "the catalogue can be refreshed globally after an authority policy change");
assert.match(retailerQueueSource, /productImageEnrichment/, "a whole-catalogue refresh must re-evaluate images as well as listings");

const missingPackQueueSource = readFileSync(new URL("enqueue-missing-retailer-pack-sizes.ts", import.meta.url), "utf8");
assert.match(missingPackQueueSource, /packSize: null/, "missing package sizes must be found from retailer listings");
assert.match(missingPackQueueSource, /productType: \{ not: "GENERIC_PRODUCE" \}/, "loose generic produce is not incorrectly treated as a missing package");
assert.match(missingPackQueueSource, /force: true/, "package-size recovery must bypass the normal freshness window");

const weakIdentityRepairSource = readFileSync(new URL("repair-weak-retailer-identities.ts", import.meta.url), "utf8");
assert.match(weakIdentityRepairSource, /words\(currentName\)\.length !== 1/, "only one-word weak identities may be expanded from linked retailer listings");
assert.match(weakIdentityRepairSource, /linked-retailer-repair/, "the replaced weak identity must remain searchable as an alias");

console.log("Retailer refresh coverage regressions passed.");
