import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifestUrl = new URL("./woolworths-core-categories.json", import.meta.url);
const runnerUrl = new URL("./refresh-woolworths-core.mjs", import.meta.url);

const categories = JSON.parse(await readFile(manifestUrl, "utf8"));
const runner = await readFile(runnerUrl, "utf8");

assert.ok(Array.isArray(categories), "manifest must be an array");
assert.equal(categories.length, 13, "core manifest should contain 13 verified categories");
assert.equal(new Set(categories).size, categories.length, "categories must be unique");

for (const category of categories) {
  assert.equal(typeof category, "string");
  assert.ok(
    category.startsWith("/shop/browse/"),
    `invalid category path: ${category}`
  );
}

const knownBadPaths = [
  "/shop/browse/cheese",
  "/shop/browse/cleaning/cleaning-goods",
  "/shop/browse/fruit-veg/fresh-fruit",
];

for (const badPath of knownBadPaths) {
  assert.ok(
    !categories.includes(badPath),
    `known bad category must not be in manifest: ${badPath}`
  );
}

const requiredPaths = [
  "/shop/browse/dairy-eggs-fridge/milk",
  "/shop/browse/dairy-eggs-fridge/cheese",
  "/shop/browse/cleaning-maintenance/cleaning-goods",
  "/shop/browse/freezer/frozen-fruit",
];

for (const requiredPath of requiredPaths) {
  assert.ok(
    categories.includes(requiredPath),
    `verified category missing from manifest: ${requiredPath}`
  );
}

assert.match(runner, /MAX_ATTEMPTS\s*=\s*3/, "runner must use bounded retries");
assert.match(runner, /for \(let index = 0; index < categories\.length; index\+\+\)/,
  "runner must process categories sequentially");
assert.match(runner, /results\.push\(result\)/,
  "runner must retain each category result");
assert.match(runner, /continue|for \(let index/,
  "runner must continue through later categories");
assert.match(runner, /status >= 500|response\.status >= 500/,
  "5xx responses must be retryable");
assert.match(runner, /response\.status === 429/,
  "429 responses must be retryable");
assert.match(runner, /process\.exitCode = 1/,
  "unrecovered failures must produce a nonzero exit");
assert.doesNotMatch(
  runner,
  /DELETE\s+FROM|DROP\s+TABLE|clear.*catalogue/i,
  "runner must not destructively clear catalogue data"
);

console.log("✓ Woolworths core catalogue manifest and runner contract passed");
