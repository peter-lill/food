import assert from "node:assert/strict";
import {
  enabledRetailers,
  missingStoreRetailers,
  retailerSetupStatus,
  preferredStoreIds,
  retailerNameMatches,
} from "../src/lib/retailers/retailer-preferences";

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

console.log("Retailer preference regression tests passed.");
