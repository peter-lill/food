import assert from "node:assert/strict";
import { createBarcodeDuplicateGuard } from "../src/lib/scanner/duplicate-guard";

const guard = createBarcodeDuplicateGuard(1_500);

assert.equal(guard.accept("9300605148260", 1_000), true);
assert.equal(guard.accept("9300605148260", 2_499), false);
assert.equal(guard.accept("9300605148260", 2_500), true);
assert.equal(guard.accept(" 9310140005270 ", 2_600), true);
assert.equal(guard.accept("", 2_700), false);

guard.reset();
assert.equal(guard.accept("9300605148260", 2_701), true);

console.log("Scanner duplicate suppression checks passed.");
