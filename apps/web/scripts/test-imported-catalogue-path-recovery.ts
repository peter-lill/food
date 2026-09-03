import assert from "node:assert/strict";
import { canonicalAldiExternalId, drakesProductExternalId, needsAuthoritativeCategoryPathRestore, unambiguousRetailerNamePaths } from "./imported-catalogue-path-recovery";

assert.equal(needsAuthoritativeCategoryPathRestore(null), true);
assert.equal(needsAuthoritativeCategoryPathRestore("Legacy shelf 8"), true);
assert.equal(needsAuthoritativeCategoryPathRestore("/category/dairy"), false);
assert.equal(needsAuthoritativeCategoryPathRestore("/category/general-merchandise"), false);
assert.equal(canonicalAldiExternalId("0005428639"), "5428639");
assert.equal(canonicalAldiExternalId("0"), "0");
assert.equal(canonicalAldiExternalId("not-an-id"), null);
assert.equal(drakesProductExternalId("089:norco-full-cream-fresh-milk-2l"), "norco-full-cream-fresh-milk-2l");
assert.equal(drakesProductExternalId("not-a-drakes-id"), null);

const namePaths = unambiguousRetailerNamePaths([
  { name: "Bickfords Creamy Soda Cordial", categoryPath: "/category/drinks" },
  { name: "Bickfords Creamy Soda Cordial", categoryPath: "/category/drinks/cordial" },
  { name: "Mixed product", categoryPath: "/category/drinks" },
  { name: "Mixed product", categoryPath: "/category/pantry" },
]);
assert.equal(namePaths.get("bickfords creamy soda cordial"), "/category/drinks");
assert.equal(namePaths.get("mixed product"), null);

console.log("imported catalogue path recovery tests passed");
