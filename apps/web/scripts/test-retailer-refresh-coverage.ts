import assert from "node:assert/strict";

import { retailersNeedRefresh } from "../src/lib/retailers/retailer-intelligence.service";

assert.equal(retailersNeedRefresh([]), true);
assert.equal(retailersNeedRefresh(["Woolworths"]), true);
assert.equal(retailersNeedRefresh(["Coles"]), true);
assert.equal(retailersNeedRefresh(["Coles", "Woolworths"]), false);
assert.equal(retailersNeedRefresh(["Coles", "Woolworths", "Coles"]), false);

console.log("Retailer refresh coverage regressions passed.");
