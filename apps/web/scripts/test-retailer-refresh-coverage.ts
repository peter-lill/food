import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  imageCandidateSourcePriority,
  packagedMatchScore,
} from "../src/lib/products/image-intelligence";
import { imageCandidateOverallScore } from "../src/lib/products/image-candidate-score";
import {
  authoritativeRetailerName,
  identityScore,
  informativeRetailerIdentity,
  retailerSearchQuery,
  retailersNeedRefresh,
} from "../src/lib/retailers/retailer-intelligence.service";

assert.equal(retailersNeedRefresh([]), true);
assert.equal(retailersNeedRefresh(["Woolworths"]), true);
assert.equal(retailersNeedRefresh(["Coles"]), true);
assert.equal(retailersNeedRefresh(["Coles", "Woolworths"]), false);
assert.equal(retailersNeedRefresh(["Coles", "Woolworths", "Coles"]), false);

const repairedMix = {
  id: "brownie-mix",
  name: "Betty Crocker Gluten Free Chocolate Fudge Brownie Mix 450g",
  canonicalName: "Mix",
  brand: null,
  barcode: null,
  packSize: "450g",
  imageUrl: null,
};
assert.equal(informativeRetailerIdentity(repairedMix), repairedMix.name, "a stale generic canonical label must not override the detailed product name");
assert.equal(retailerSearchQuery(repairedMix), `${repairedMix.name} 450g`, "retailer search must use the detailed displayed identity, not Mix");
assert.ok(identityScore(repairedMix, {
  retailer: "Coles",
  productName: "Coles 4 Leaf Salad Mix 200g",
  price: 8,
  packSize: "200g",
  isSpecial: false,
  sourceUrl: "https://example.com/salad",
  externalId: "salad",
  barcode: null,
  imageUrl: null,
}) < 900, "sharing only the generic word Mix must not attach an unrelated retailer product");

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
assert.match(retailerAuthoritySource, /acceptedExternalIds/, "a successful refresh must retire older retailer listings that conflict with the accepted identity");
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
assert.equal(
  packagedMatchScore(
    "Aeroplane Jelly Lite Crystals Lime 9g x 2 pack",
    "Aeroplane Jelly Lite Crystals Lime 9g x 2 pack",
    "woolworths",
  ),
  99,
  "the exact Woolworths Jelly Lite identity and pack must score as an authoritative match",
);
assert.equal(
  imageCandidateOverallScore({ qualityScore: 0, providerScore: 100, identityScore: 100 }),
  35,
  "a 35 percent exact retailer candidate identifies a failed image download rather than a weak identity match",
);
assert.ok(
  imageCandidateOverallScore({ qualityScore: 100, providerScore: 95, identityScore: 90 }) >= 95,
  "a reachable exact retailer image should clear automatic promotion comfortably",
);

const imageRecoverySource = readFileSync(new URL("../src/lib/products/image-recovery.ts", import.meta.url), "utf8");
assert.match(imageRecoverySource, /isGenericFoodImageEligible\(product\)/, "generic image generation must use the complete produce eligibility policy");
assert.match(imageRecoverySource, /searchColesAndWoolworthsCatalogue\(barcode\)/, "known barcodes should search retailer catalogues directly");
assert.match(imageRecoverySource, /linkedRetailerImages/, "existing retailer listings should provide replacement image candidates");
assert.match(imageRecoverySource, /candidateSelectionPriority\(right\.candidate\)/, "all usable images should be ranked before selection");
assert.match(imageRecoverySource, /await markSelectedCandidate\(product\.id, candidateId\);\s+await makeCandidatePrimaryAsset\(product\.id, candidateId\);/, "the selected image candidate should be stored and applied automatically");
assert.match(imageRecoverySource, /isGeneric \|\| !product\.imageUrl\.startsWith\("generated:\/\/"\)/, "specific products must not recycle an old generated generic image during recovery");
const imageQueueSource = readFileSync(new URL("./enqueue-selected-product-images.ts", import.meta.url), "utf8");
assert.match(imageQueueSource, /assessProductImage\(candidate\.url\)/, "the backlog should reassess authoritative candidates whose original CDN check failed");
assert.match(imageQueueSource, /retailerProductUrl/, "the backlog should reassess direct retailer images with the product page that supplied them");
assert.match(imageQueueSource, /COALESCE\(c\."qualityScore", 0\) = 0/, "the backlog reassessment should remain limited to failed or missing quality checks");
assert.match(imageQueueSource, /c\."accepted" = true[\s\S]*?"overallScore"[\s\S]*?>= 75[\s\S]*?"identityScore"[\s\S]*?>= 90[\s\S]*?"providerScore"[\s\S]*?>= 90/, "the image backlog should promote only accepted, high-confidence authoritative candidates");
assert.match(imageQueueSource, /NOT EXISTS \([\s\S]*?selected\."selected" = true/, "the image backlog must not replace an existing selected candidate");
assert.match(imageQueueSource, /data: \{ imageUrl: candidate\.url, lifecycle: "READY" \}/, "a promoted backlog candidate should update the product image record");
assert.match(imageQueueSource, /c\."assetId" IS NULL OR p\."primaryImageAssetId" IS DISTINCT FROM c\."assetId"/, "a candidate preview asset must still be eligible for primary-image reconciliation");
const imageQualitySource = readFileSync(new URL("../src/lib/products/image-quality.ts", import.meta.url), "utf8");
assert.match(imageQualitySource, /fetchRemoteImage\(url, timeoutMs\)/, "quality scoring and image import must use the same retailer-aware downloader");
const remoteImageSource = readFileSync(new URL("../src/lib/images/remote-image.ts", import.meta.url), "utf8");
assert.match(remoteImageSource, /woolworths\.com\.au\/shop\/productdetails/, "Woolworths CDN retries should carry the matching product-page context");
assert.match(remoteImageSource, /coles\\\.com\\\.au/, "Coles retailer product pages should be allowed as image-download context");
const imageAssetSource = readFileSync(new URL("../src/lib/images/image-asset.service.ts", import.meta.url), "utf8");
assert.match(imageAssetSource, /retailerProductUrl/, "the imported primary asset should use its linked retailer product page context");
const productImageRouteSource = readFileSync(new URL("../src/app/api/products/[productId]/image/route.ts", import.meta.url), "utf8");
assert.match(productImageRouteSource, /isGenericFoodImageEligible\(product\)/, "the image endpoint must check full generic eligibility before serving a generated asset");
assert.match(productImageRouteSource, /const genericFamily = allowGenericImage/, "specific unbranded retailer products must retain retailer image fallbacks");
assert.match(productImageRouteSource, /"source" <> 'OpenAI generated'/, "specific products must not serve a previously selected generated generic asset");

const retailerQueueSource = readFileSync(new URL("enqueue-product-retailer-enrichment.ts", import.meta.url), "utf8");
assert.match(retailerQueueSource, /process\.argv\.includes\("--all"\)/, "the catalogue can be refreshed globally after an authority policy change");
assert.match(retailerQueueSource, /productImageEnrichment/, "a whole-catalogue refresh must re-evaluate images as well as listings");
const workerHandlerSource = readFileSync(new URL("../src/lib/jobs/worker-handlers.ts", import.meta.url), "utf8");
assert.match(workerHandlerSource, /provider\.includes\("coles"\) && provider\.includes\("woolworths"\)/, "combined retailer jobs must not be misreported as Woolworths-only");
assert.match(workerHandlerSource, /enrichProductFromRetailerLabels\(productId\)/, "every Coles and Woolworths retailer refresh must also populate published label details");
assert.match(workerHandlerSource, /saveProductQuality\(productId\)/, "retailer refresh must recalculate quality after label details are populated");
assert.match(workerHandlerSource, /"primaryImageAssetId" = \$\{asset\.id\}[\s\S]*?c\."selected" = true/, "an imported selected candidate must be linked as the product primary asset");
const workerSource = readFileSync(new URL("worker.ts", import.meta.url), "utf8");
assert.match(workerSource, /job\.completed[\s\S]*result,/, "completed worker logs must expose Coles and Woolworths match counts from the job result");

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
