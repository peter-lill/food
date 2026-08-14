import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bridge = readFileSync(new URL("../../../services/grocery-mcp/bridge.py", import.meta.url), "utf8");
const compose = readFileSync(new URL("../../../docker-compose.yml", import.meta.url), "utf8");

assert.match(bridge, /WOOLWORTHS_CATEGORY_API_PATH = "\/apis\/ui\/browse\/category"/);
assert.match(bridge, /response\.url[\s\S]*response\.json\(\)/, "category JSON must be captured from the real browser response");
assert.match(bridge, /woolworths_product_nodes\(payload\)/, "nested Bundles and Products must be flattened");
assert.match(bridge, /stockcode TEXT PRIMARY KEY, barcode TEXT/, "stock codes and barcodes must remain exact text");
assert.match(bridge, /ON CONFLICT\(stockcode\) DO UPDATE/, "category refreshes must be resumable and idempotent");
assert.match(bridge, /cached = search_woolworths_cache[\s\S]*if cached:[\s\S]*return cached/, "search must prefer the local catalogue");
const cacheLookup = bridge.indexOf("cached = search_woolworths_cache");
const circuitLookup = bridge.indexOf("unavailable_for = _woolworths_unavailable_until");
assert.ok(cacheLookup >= 0 && cacheLookup < circuitLookup, "the local catalogue must remain searchable while the live circuit is open");
assert.match(bridge, /stockcode = \? OR barcode = \?/, "stockcode and barcode searches must be exact");
assert.match(bridge, /\/woolworths\/catalogue\/status/, "catalogue coverage must be observable");
assert.match(bridge, /WOOLWORTHS_CDP_URL = os\.getenv/, "verified browser connection must be configurable");
assert.match(bridge, /chromium\.connect_over_cdp\(WOOLWORTHS_CDP_URL\)/, "category ingestion must reuse a user-verified browser");
assert.match(bridge, /verified browser session is not configured/, "anonymous category refreshes must fail with an actionable reason");
assert.match(bridge, /browser is not None and owns_browser/, "the bridge must never close the user's external browser");
assert.match(compose, /WOOLWORTHS_CDP_URL: \$\{WOOLWORTHS_CDP_URL:-\}/);
assert.match(bridge, /page\.evaluate\("window\.scrollTo/, "category discovery must load paginated or lazy product bundles");
assert.match(compose, /WOOLWORTHS_CATALOGUE_DB: \/data\/woolworths-catalogue\.sqlite3/);
assert.match(compose, /food_grocery_catalogue_data:\/data/);

console.log("Woolworths catalogue ingestion safeguards passed.");
