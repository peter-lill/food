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

assert.deepEqual(enabledRetailers([]), ["Coles", "Woolworths"], "ALDI remains opt-in until the shopper selects its catalogue prices");
assert.deepEqual(
  enabledRetailers([{ retailer: "Coles", enabled: false }, { retailer: "Woolworths", enabled: true }]),
  ["Woolworths"],
  "saved opt-outs override defaults",
);
assert.deepEqual(
  missingStoreRetailers(["ALDI"], []),
  [],
  "ALDI catalogue pricing must not require a selected local store",
);
assert.deepEqual(
  retailerSetupStatus({ homePostcode: null, enabled: ["ALDI"], stores: [] }),
  { ready: true, needsLocation: false, needsRetailers: false, missingStores: [] },
  "ALDI catalogue comparison is available without a postcode or unsupported store lookup",
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
assert.equal(retailerNameMatches("ALDI", "ALDI Rochedale"), true);
assert.equal(retailerNameMatches("Drakes", "Drakes Online McDowall"), true);
assert.deepEqual(
  missingStoreRetailers(["Drakes"], []),
  ["Drakes"],
  "Drakes uses a selected store because its catalogue is store-specific",
);
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
assert.doesNotMatch(storePreferencesSource, /retailer !== "Drakes"/, "Drakes must offer the official nearby-store lookup when current location is available");
assert.match(storePreferencesSource, /catalogue prices are national listings/, "ALDI must be visibly labelled as catalogue pricing rather than local stock");
assert.match(storePreferencesSource, /Interactive map/, "store selection must show an embedded interactive map instead of only an outbound map link");
assert.match(storePreferencesSource, /output=embed/, "the map remains inside Food while selecting a store");
assert.match(storePreferencesSource, /storeMapMarker[\s\S]*RetailerLogo compact retailer={store\.retailer}/, "each saved-store map marks the location with its retailer logo");
assert.match(storePreferencesSource, /preferred\.map\(\(store\) => <StoreMap/, "every saved retailer store renders its own embedded map");
assert.doesNotMatch(storePreferencesSource, /mapStore/, "one retailer's map must not replace another retailer's map");
assert.doesNotMatch(storePreferencesSource, /View map/, "each saved store shows its map directly instead of requiring an inconsistent map button");
assert.match(storePreferencesSource, /No online price catalogue/, "nearby stores without a usable price catalogue are disclosed instead of being silently hidden");
assert.match(storePreferencesSource, /select a location with an online price catalogue/, "Drakes nearby-store helper text distinguishes store finding from price availability");
assert.doesNotMatch(storePreferencesSource, /coles-store-query/);

const accountStylesSource = readFileSync(
  new URL("../src/components/account/account.module.css", import.meta.url),
  "utf8",
);
assert.match(accountStylesSource, /\.storeResultsList\s*{[\s\S]*?max-height:\s*252px/);
assert.match(accountStylesSource, /\.storeResultsList\s*{[\s\S]*?overflow-y:\s*auto/);
assert.match(accountStylesSource, /\.storeMapMarker\s*{[\s\S]*?pointer-events:\s*none/, "the branded location marker does not block map interaction");
assert.match(accountStylesSource, /\.retailerHeading\s*>\s*div\s*>\s*strong\s*{[\s\S]*?height:\s*48px/);

const healthConnectStylesSource = readFileSync(
  new URL("../src/components/account/health-connect-pairing.module.css", import.meta.url),
  "utf8",
);
assert.match(healthConnectStylesSource, /^\.card\{min-width:0/);
assert.match(healthConnectStylesSource, /@media\(max-width:1100px\)\{\.card\{grid-column:1\/-1\}\}/);

console.log("Retailer preference regression tests passed.");
