import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  enabledRetailers,
  missingStoreRetailers,
  retailerSetupStatus,
  preferredStoreIds,
  retailerNameMatches,
} from "../src/lib/retailers/retailer-preferences";
import { formatHomeLocation } from "../src/lib/location-preferences";

assert.deepEqual(enabledRetailers([]), ["Coles", "Woolworths"], "current retailers remain enabled for existing users");
assert.deepEqual(
  enabledRetailers([{ retailer: "Coles", enabled: false }, { retailer: "Woolworths", enabled: true }]),
  ["Woolworths"],
  "saved opt-outs override defaults",
);
assert.deepEqual(
  missingStoreRetailers(["Coles", "Woolworths"], [{ retailer: "Coles", isPreferred: true }]),
  ["Woolworths"],
  "setup identifies each enabled retailer without a preferred store",
);
assert.deepEqual(
  retailerSetupStatus({
    homePostcode: "4127",
    enabled: ["Coles"],
    stores: [{ retailer: "Coles", isPreferred: true }],
  }),
  { ready: true, needsLocation: false, needsRetailers: false, missingStores: [] },
  "setup is ready only when location, enabled retailer and preferred store are present",
);
assert.equal(
  retailerSetupStatus({ homePostcode: null, enabled: [], stores: [] }).ready,
  false,
  "missing profile configuration never claims local prices are ready",
);
assert.deepEqual(
  preferredStoreIds([
    { retailer: "Coles", storeId: "newest", isPreferred: true },
    { retailer: "Coles", storeId: "older", isPreferred: true },
    { retailer: "Woolworths", storeId: "2621", isPreferred: true },
  ]),
  { Coles: "newest", Woolworths: "2621" },
  "the most recently ordered preferred store is used for live retailer searches",
);
assert.equal(retailerNameMatches("Coles", "Coles Supermarkets"), true);
assert.equal(retailerNameMatches("Woolworths", "Woolworths Springwood"), true);
assert.equal(retailerNameMatches("Coles", "Woolworths"), false);
assert.equal(formatHomeLocation({ homeLocation: null, homePostcode: "4114" }), "4114");

const retailerLogoSource = readFileSync(
  new URL("../src/components/retailers/RetailerLogo.tsx", import.meta.url),
  "utf8",
);
assert.match(retailerLogoSource, /src: "\/retailer-logos\/coles\.svg"/);
assert.match(retailerLogoSource, /src: "\/retailer-logos\/woolworths\.png"/);
assert.doesNotMatch(retailerLogoSource, /displayName/, "brand marks must not be combined with a separately rendered wordmark");
assert.match(retailerLogoSource, /background: "transparent"/);
assert.doesNotMatch(retailerLogoSource, /overflow: "hidden"/, "retailer logo frames must never crop brand marks");
assert.match(retailerLogoSource, /height: "100%"/);
assert.match(retailerLogoSource, /width: "100%"/);

const productStylesSource = readFileSync(new URL("../src/app/products/products.module.css", import.meta.url), "utf8");
const productHubStylesSource = readFileSync(
  new URL("../src/app/products/products-hub.module.css", import.meta.url),
  "utf8",
);
for (const stylesSource of [productStylesSource, productHubStylesSource]) {
  assert.match(stylesSource, /\[data-retailer-logo\] img\{[^}]*width:100%!important/);
  assert.match(stylesSource, /\[data-retailer-logo\] img\{[^}]*height:100%!important/);
  assert.match(stylesSource, /\[data-retailer-logo\] img\{[^}]*object-fit:contain!important/);
}

const colesLogo = readFileSync(new URL("../public/retailer-logos/coles.svg", import.meta.url), "utf8");
assert.doesNotMatch(colesLogo, /<rect\b/i, "the local Coles wordmark must not include a background rectangle");
const woolworthsLogo = readFileSync(new URL("../public/retailer-logos/woolworths.png", import.meta.url));
assert.ok(
  woolworthsLogo.includes(Buffer.from("tRNS")),
  "the official local Woolworths Wapple must retain its PNG transparency channel",
);
assert.doesNotMatch(
  retailerLogoSource,
  /edigitalagency\.com\.au/,
  "Woolworths branding must not depend on a mutable third-party image",
);

const storePreferencesSource = readFileSync(
  new URL("../src/components/account/RetailerStorePreferences.tsx", import.meta.url),
  "utf8",
);
assert.match(storePreferencesSource, /RetailerLogo retailer={retailer}/);
assert.match(storePreferencesSource, /getCurrentLocation\(\)/);
assert.doesNotMatch(storePreferencesSource, /coles-store-query/);

const accountStylesSource = readFileSync(
  new URL("../src/components/account/account.module.css", import.meta.url),
  "utf8",
);
assert.match(accountStylesSource, /\.storeResultsList\s*{[\s\S]*?max-height:\s*252px/);
assert.match(accountStylesSource, /\.storeResultsList\s*{[\s\S]*?overflow-y:\s*auto/);
assert.match(accountStylesSource, /\.retailerHeading\s*>\s*div\s*>\s*strong\s*{[\s\S]*?height:\s*48px/);

const healthConnectStylesSource = readFileSync(
  new URL("../src/components/account/health-connect-pairing.module.css", import.meta.url),
  "utf8",
);
assert.match(healthConnectStylesSource, /^\.card\{min-width:0/);
assert.match(healthConnectStylesSource, /@media\(max-width:1100px\)\{\.card\{grid-column:1\/-1\}\}/);

console.log("Retailer preference regression tests passed.");
