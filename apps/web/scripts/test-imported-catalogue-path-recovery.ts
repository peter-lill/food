import assert from "node:assert/strict";
import { needsAuthoritativeCategoryPathRestore } from "./imported-catalogue-path-recovery";

assert.equal(needsAuthoritativeCategoryPathRestore(null), true);
assert.equal(needsAuthoritativeCategoryPathRestore("Legacy shelf 8"), true);
assert.equal(needsAuthoritativeCategoryPathRestore("/category/dairy"), false);
assert.equal(needsAuthoritativeCategoryPathRestore("/category/general-merchandise"), false);

console.log("imported catalogue path recovery tests passed");
