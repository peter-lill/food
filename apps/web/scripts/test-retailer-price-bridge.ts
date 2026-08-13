import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { toRetailerCatalogueCandidate } from "../src/lib/prices/coles-woolworths-provider";
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
  source: "coles-woolworths-mcp",
});

assert.ok(candidate);
assert.equal(candidate.productName, "Kit Kat Milk Chocolate Block 160g");
assert.equal(candidate.packSize, "160g");
assert.equal(candidate.isSpecial, true);
assert.equal(candidate.externalId, "12345");
assert.equal(candidate.sourceUrl, "https://www.coles.com.au/product/kit-kat-milk-chocolate-block-160g-12345");

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
  source: "coles-woolworths-mcp",
});
assert.equal(colesPackCandidate?.packSize, "30 g", "Coles package size must survive independently of the product name or unit price");

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
assert.match(bridgeSource, /WOOLWORTHS_CIRCUIT_SECONDS[\s\S]*_woolworths_unavailable_until/, "one Woolworths read timeout must temporarily open a circuit instead of delaying every queued query");
assert.match(bridgeSource, /except \(TimeoutError, socket\.timeout, RuntimeError\)/, "Woolworths browser failures must open the circuit explicitly");
assert.doesNotMatch(bridgeSource, /woolworths_search_products\(query=query\)/, "the obsolete upstream Woolworths GET client must not be called");

const genericImageSource = readFileSync(new URL("../src/lib/products/generic-image-generation.ts", import.meta.url), "utf8");
assert.match(genericImageSource, /credit_balance_exhausted\|insufficient_quota\|no credits remaining/, "exhausted OpenAI credit must skip generation rather than retrying an impossible request");

console.log("Retailer bridge metadata regressions passed.");
