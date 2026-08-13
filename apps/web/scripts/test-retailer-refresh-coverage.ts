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
assert.match(imageRecoverySource, /isGenericFoodImageEligible\(product\)/, "generic image generation must use the complete produce eligibility policy");
assert.match(imageRecoverySource, /searchColesAndWoolworthsCatalogue\(barcode\)/, "known barcodes should search retailer catalogues directly");
assert.match(imageRecoverySource, /linkedRetailerImages/, "existing retailer listings should provide replacement image candidates");
assert.match(imageRecoverySource, /candidateSelectionPriority\(right\.candidate\)/, "all usable images should be ranked before selection");
assert.match(imageRecoverySource, /isGeneric \|\| !product\.imageUrl\.startsWith\("generated:\/\/"\)/, "specific products must not recycle an old generated generic image during recovery");
const productImageRouteSource = readFileSync(new URL("../src/app/api/products/[productId]/image/route.ts", import.meta.url), "utf8");
assert.match(productImageRouteSource, /isGenericFoodImageEligible\(product\)/, "the image endpoint must check full generic eligibility before serving a generated asset");
assert.match(productImageRouteSource, /const genericFamily = allowGenericImage/, "specific unbranded retailer products must retain retailer image fallbacks");
assert.match(productImageRouteSource, /"source" <> 'OpenAI generated'/, "specific products must not serve a previously selected generated generic asset");

const retailerQueueSource = readFileSync(new URL("enqueue-product-retailer-enrichment.ts", import.meta.url), "utf8");
assert.match(retailerQueueSource, /process\.argv\.includes\("--all"\)/, "the catalogue can be refreshed globally after an authority policy change");
assert.match(retailerQueueSource, /productImageEnrichment/, "a whole-catalogue refresh must re-evaluate images as well as listings");
const workerHandlerSource = readFileSync(new URL("../src/lib/jobs/worker-handlers.ts", import.meta.url), "utf8");
assert.match(workerHandlerSource, /enrichProductFromRetailerLabels\(productId\)/, "every Coles and Woolworths retailer refresh must also populate published label details");
assert.match(workerHandlerSource, /saveProductQuality\(productId\)/, "retailer refresh must recalculate quality after label details are populated");

const missingPackQueueSource = readFileSync(new URL("enqueue-missing-retailer-pack-sizes.ts", import.meta.url), "utf8");
assert.match(missingPackQueueSource, /packSize: null/, "missing package sizes must be found from retailer listings");
assert.match(missingPackQueueSource, /productType: \{ not: "GENERIC_PRODUCE" \}/, "loose generic produce is not incorrectly treated as a missing package");
assert.match(missingPackQueueSource, /force: true/, "package-size recovery must bypass the normal freshness window");

const weakIdentityRepairSource = readFileSync(new URL("repair-weak-retailer-identities.ts", import.meta.url), "utf8");
assert.match(weakIdentityRepairSource, /identities\.length !== listingNames\.length/, "weak identities must not be expanded from a mixed set of retailer products");
assert.match(weakIdentityRepairSource, /new Set\(identities\)\.size === 1/, "retailer repair requires unanimous grocery identity evidence");
assert.match(weakIdentityRepairSource, /linked-retailer-repair/, "the replaced weak identity must remain searchable as an alias");
assert.match(imageRecoverySource, /incompatibleProduceWords/, "generic produce image selection must reject conflicting varieties");
assert.match(imageRecoverySource, /with oyster/, "generic produce image selection must reject prepared dishes");

console.log("Retailer refresh coverage regressions passed.");
