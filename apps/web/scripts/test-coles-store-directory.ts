import assert from "node:assert/strict";
import {
  colesStoreDirectory,
  getColesStoreById,
  searchColesStoreDirectory,
} from "../src/lib/retailers/coles-store-directory";

assert.equal(colesStoreDirectory.length, 914, "only Coles-branded retail locations from the official export are included");
assert.equal(
  new Set(colesStoreDirectory.map((store) => store.storeId)).size,
  colesStoreDirectory.length,
  "store numbers remain unique",
);

assert.deepEqual(getColesStoreById("4472"), {
  retailer: "Coles",
  storeId: "4472",
  name: "Coles Springwood",
  address: "Arndale Shopping Centre Cinderella Drive Springwood 4127 QLD",
  postcode: "4127",
  latitude: null,
  longitude: null,
  distanceKm: null,
});
assert.equal(searchColesStoreDirectory("springwood")[0]?.storeId, "4472");
assert.equal(searchColesStoreDirectory("4472")[0]?.storeId, "4472");
assert.equal(
  searchColesStoreDirectory("4114").some((store) => store.storeId === "4496"),
  true,
  "home-postcode lookup includes Coles Woodridge",
);
assert.deepEqual(searchColesStoreDirectory(""), []);

console.log("Coles store directory regression tests passed.");
