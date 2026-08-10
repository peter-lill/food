import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("seed-starter-catalogue.ts", import.meta.url), "utf8");
assert.match(source, /starterProducts\.length/, "the starter catalogue must report its bounded batch size");
assert.match(source, /ProductType\.GENERIC_PRODUCE/, "fresh produce must be created as generic produce");
assert.match(source, /productAlias\.findUnique/, "an existing alias must prevent duplicate starter products");
assert.match(source, /Packaged products remain unpriced/, "the import must not invent packaged retailer prices");
console.log("Starter catalogue safeguards passed.");
