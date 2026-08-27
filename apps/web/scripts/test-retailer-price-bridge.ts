import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { retailerProductUrl, toRetailerCatalogueCandidate } from "../src/lib/prices/coles-woolworths-provider";
import { identityScore, retailerSearchQuery } from "../src/lib/retailers/retailer-intelligence.service";

const candidate = toRetailerCatalogueCandidate({
  retailer: "Coles",
  name: "Kit Kat Milk Chocolate Block 160g",
  price: 5,
  wasPrice: 7.5,
  isSpecial: true,
  promotion: "2 for $10",
  packSize: "160g",
  unit: "160g",
  store: "coles",
  barcode: "9300605075753",
  imageUrl: null,
  productId: "12345",
  productUrl: null,
  storeSpecific: true,
  source: "coles-woolworths-mcp",
});

assert.ok(candidate);
assert.equal(candidate.productName, "Kit Kat Milk Chocolate Block 160g");
assert.equal(candidate.packSize, "160g");
assert.equal(candidate.isSpecial, true);
assert.equal(candidate.externalId, "12345");
assert.equal(candidate.sourceUrl, "https://www.coles.com.au/product/kit-kat-milk-chocolate-block-160g-12345");
assert.equal(
  retailerProductUrl("Woolworths", "Nestle Milkybar Nesquik Strawberry Block 170g", "114435"),
  "https://www.woolworths.com.au/shop/productdetails/114435",
  "cached Woolworths listings retain a direct canonical product page",
);

const colesPackCandidate = toRetailerCatalogueCandidate({
  retailer: "Coles",
  name: "Ground Cumin",
  price: 2.3,
  wasPrice: null,
  isSpecial: false,
  promotion: null,
  packSize: "30 g",
  unit: null,
  store: "coles",
  barcode: "9300000000000",
  imageUrl: null,
  productId: "cumin-30g",
  productUrl: null,
  storeSpecific: true,
  source: "coles-woolworths-mcp",
});
assert.equal(colesPackCandidate?.packSize, "30 g", "Coles package size must survive independently of the product name or unit price");

const aldiCandidate = toRetailerCatalogueCandidate({
  retailer: "ALDI",
  name: "Moser Roth Dark Chocolate 125g",
  price: 3.99,
  wasPrice: null,
  isSpecial: false,
  promotion: null,
  packSize: "125 g",
  unit: "$3.19 per 100 g",
  store: "ALDI public catalogue",
  barcode: null,
  imageUrl: "https://images.example/aldi-chocolate.jpg",
  productId: "173130",
  productUrl: "https://www.aldi.com.au/product/moser-roth-dark-chocolate-125g-000000000000173130",
  storeSpecific: false,
  source: "aldi-public-catalogue",
});
assert.equal(aldiCandidate?.retailer, "ALDI");
assert.equal(aldiCandidate?.sourceUrl, "https://www.aldi.com.au/product/moser-roth-dark-chocolate-125g-000000000000173130");

const drakesCandidate = toRetailerCatalogueCandidate({
  retailer: "Drakes",
  name: "Norco Full Cream Fresh Milk 2L",
  price: 5.2,
  wasPrice: null,
  isSpecial: false,
  promotion: null,
  packSize: "2L",
  unit: null,
  store: "Drakes store 087",
  barcode: null,
  imageUrl: null,
  productId: "norco-full-cream-fresh-milk-2l",
  productUrl: "https://087.drakes.com.au/lines/norco-full-cream-fresh-milk-2l",
  storeSpecific: true,
  source: "coles-woolworths-mcp",
});
assert.equal(drakesCandidate?.retailer, "Drakes");
assert.equal(drakesCandidate?.sourceUrl, "https://087.drakes.com.au/lines/norco-full-cream-fresh-milk-2l");

const kitKatScore = identityScore(
  {
    id: "kitkat-aero-mint",
    name: "Kitkat Aero Mint Chocolate Block",
    canonicalName: "Kitkat Aero Mint Chocolate Block",
    brand: "Nestlé",
    barcode: "9300605158696",
    packSize: "155g",
    imageUrl: null,
  },
  {
    retailer: "Coles",
    productName: "Kit Kat Aero Mint Chocolate Block 155g",
    price: 3.75,
    packSize: "155g",
    imageUrl: null,
    sourceUrl: "https://www.coles.com.au/product/kit-kat-aero-mint-block-chocolate-155g-1314693",
    externalId: "1314693",
    barcode: null,
    isSpecial: true,
  },
);
assert.ok(kitKatScore >= 900, "spacing differences in KitKat must not reject the exact Coles pack");

const kitKatProduct = {
  name: "Kitkat Aero Mint Chocolate Block",
  canonicalName: "Kitkat Aero Mint Chocolate Block",
  brand: "Nestlé",
  barcode: "9300605158696",
  packSize: "155g",
};
assert.equal(
  retailerSearchQuery(kitKatProduct),
  "9300605158696",
  "Every retailer uses the same barcode-first query when an exact product barcode is available",
);

const bridgeSource = readFileSync(new URL("../../../services/grocery-mcp/bridge.py", import.meta.url), "utf8");
const providerSource = readFileSync(new URL("../src/lib/prices/providers/mcp-grocery.provider.ts", import.meta.url), "utf8");
const catalogueSource = readFileSync(new URL("../src/lib/prices/coles-woolworths-provider.ts", import.meta.url), "utf8");
const livePriceSearchSource = readFileSync(new URL("../src/components/prices/LiveShoppingPriceSearch.tsx", import.meta.url), "utf8");
const shoppingPriceSearchRouteSource = readFileSync(new URL("../src/app/api/prices/shopping-list/[listId]/search/route.ts", import.meta.url), "utf8");
const comparisonWorkspaceSource = readFileSync(new URL("../src/components/prices/SupermarketComparisonWorkspace.tsx", import.meta.url), "utf8");
const aldiImporterSource = readFileSync(new URL("./import-aldi-controlled.ts", import.meta.url), "utf8");
const drakesImporterSource = readFileSync(new URL("./import-drakes-controlled.ts", import.meta.url), "utf8");
assert.match(providerSource, /GROCERY_MCP_TIMEOUT_MS \?\? 30_000/, "the local retailer bridge gets enough time to complete a live Woolworths request");
assert.match(catalogueSource, /!results\.length && errors\.length[\s\S]*throw new Error/, "an all-provider timeout must fail the job so the queue retries it");
assert.match(bridgeSource, /"code", "productId", "productCode"/);
assert.match(bridgeSource, /nested_text\(source, \("brand", "brandName", "manufacturer"\)\)/);
assert.match(bridgeSource, /root\.findall\("\.\/\/{\*}storeRank"\)/, "Woolworths XML namespaces remain supported");
assert.match(bridgeSource, /latitude_text/, "store lookup accepts an explicitly selected current location");
assert.match(bridgeSource, /COLES_STORE_LOCATOR_API_KEY/);
assert.match(bridgeSource, /brandIds[\s\S]*\["COL"\]/, "nearby Coles results exclude liquor brands");
assert.match(bridgeSource, /"packSize": pack_size/, "the bridge exposes retailer package size as its own field");
assert.match(bridgeSource, /method: 'POST'[\s\S]*credentials: 'include'/, "Woolworths search runs in an established storefront session rather than the retired anonymous client");
assert.match(bridgeSource, /sync_playwright[\s\S]*page\.goto[\s\S]*page\.evaluate/, "Woolworths establishes and reuses real browser state before calling its UI API");
assert.match(bridgeSource, /ExcludeSearchTypes[\s\S]*EnableAdReRanking/, "Woolworths receives the complete current search payload");
assert.match(bridgeSource, /def clean_search_query[\s\S]*\[:120\]/, "retailer queries remove browser artefacts and enforce a safe length limit");
assert.match(bridgeSource, /DRAKES_DIRECTORY_URL/, "Drakes store selection reads the official public directory");
assert.match(bridgeSource, /DRAKES_STORE_LOCATOR_URL/, "Drakes nearby lookup uses the official store locator");
assert.match(bridgeSource, /def drakes_nearby_stores[\s\S]*action": "store_search"/, "Drakes nearby lookup uses the locator's coordinate search");
assert.match(bridgeSource, /def search_drakes[\s\S]*selected Drakes store/, "Drakes price lookup stays tied to the selected store");
assert.match(bridgeSource, /"storeSpecific": True/, "Drakes results declare their selected-store scope");
assert.match(bridgeSource, /WOOLWORTHS_CIRCUIT_SECONDS[\s\S]*_woolworths_unavailable_until/, "one Woolworths read timeout must temporarily open a circuit instead of delaying every queued query");
assert.match(bridgeSource, /except \(TimeoutError, socket\.timeout, RuntimeError\)/, "Woolworths browser failures must open the circuit explicitly");
assert.doesNotMatch(bridgeSource, /woolworths_search_products\(query=query\)/, "the obsolete upstream Woolworths GET client must not be called");
assert.match(shoppingPriceSearchRouteSource, /new Set<SupermarketRetailer>\(enabledPrimaryRetailers\.filter/, "live searches only include retailers enabled in the account");
assert.match(shoppingPriceSearchRouteSource, /retailer === "Drakes"/, "Drakes joins live price searches only when enabled in the account");
assert.match(shoppingPriceSearchRouteSource, /Boolean\(storeIds\.Drakes\)/, "Drakes is excluded until the shopper has selected its store");
assert.match(shoppingPriceSearchRouteSource, /storedCandidates\(entry, query, \[\.\.\.activePrimaryRetailers\]\)/, "cached prices honour the same enabled-retailer and selected-store guard");
assert.match(shoppingPriceSearchRouteSource, /retailerProductUrl\(sourceRetailer, listing\?\.retailerProductName/, "cached retailer prices inherit their canonical listing URL");
assert.doesNotMatch(shoppingPriceSearchRouteSource, /\[\.\.\.enabledPrimaryRetailers, "ALDI"\]/, "ALDI must not appear in a live price search until it is selected and supported");
assert.match(livePriceSearchSource, /target="_blank"/, "live retailer matches provide an external product-page link when available");
assert.match(livePriceSearchSource, /Not a match/, "a shopper can exclude an incorrect live retailer match");
assert.match(livePriceSearchSource, /setExcludedMatches/, "excluding a match must immediately recalculate the displayed comparison");
assert.match(livePriceSearchSource, /food:shopping-price-exclusions/, "a rejected match remains excluded when current prices are refreshed");
assert.match(livePriceSearchSource, /window\.localStorage\.setItem/, "rejected matches are persisted in the shopper's browser");
assert.match(comparisonWorkspaceSource, /buildProductComparisons\(data\.prices, data\.retailers\)/, "saved comparisons are restricted to selected retailers");
assert.match(aldiImporterSource, /const importAll = process\.argv\.includes\("--all"\)/, "ALDI must have a controlled full-cache importer");
assert.match(aldiImporterSource, /\/aldi\/catalogue\/products/, "the importer must only read the cached public ALDI catalogue");
assert.match(aldiImporterSource, /another record in this import has the same normalised name/, "ALDI creation must not duplicate a planned product identity");
assert.match(aldiImporterSource, /ProductLifecycle\.REVIEW_REQUIRED/, "unbarcoded ALDI catalogue creations must remain reviewable");
assert.match(aldiImporterSource, /tx\.storeProduct\.createMany/, "ALDI imports must create canonical retailer listings");
assert.match(aldiImporterSource, /tx\.priceObservation\.createMany/, "ALDI imports must preserve the source price observation");
assert.match(bridgeSource, /\/drakes\/catalogue\/refresh/, "Drakes exposes an explicit selected-store catalogue refresh endpoint");
assert.match(bridgeSource, /\/drakes\/catalogue\/products/, "Drakes exposes cached selected-store catalogue pages for controlled imports");
assert.match(drakesImporterSource, /--store=087/, "Drakes imports require an explicit selected store");
assert.match(drakesImporterSource, /\/drakes\/catalogue\/products/, "Drakes imports read only from the selected-store cache");
assert.match(drakesImporterSource, /externalId: listingExternalId\(plan\.product\)/, "Drakes listing identities are scoped to their selected store");
assert.match(drakesImporterSource, /source: `drakes-controlled-import:\$\{storeId\}`/, "Drakes observations retain their selected-store provenance");
assert.match(drakesImporterSource, /ProductLifecycle\.REVIEW_REQUIRED/, "new Drakes catalogue products remain reviewable");

const genericImageSource = readFileSync(new URL("../src/lib/products/generic-image-generation.ts", import.meta.url), "utf8");
assert.match(genericImageSource, /credit_balance_exhausted\|insufficient_quota\|no credits remaining/, "exhausted OpenAI credit must skip generation rather than retrying an impossible request");

console.log("Retailer bridge metadata regressions passed.");
