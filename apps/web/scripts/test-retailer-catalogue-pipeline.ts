import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pipeline = readFileSync(new URL("../../../scripts/run-retailer-catalogue-pipeline.sh", import.meta.url), "utf8");
const service = readFileSync(new URL("../../../deploy/food-retailer-catalogue@.service", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../../../services/grocery-mcp/bridge.py", import.meta.url), "utf8");

assert.match(pipeline, /coles\|woolworths/, "only the two verified browser-backed retailers are accepted");
assert.match(pipeline, /flock -x/, "retailer imports must be serialised across concurrent collectors");
assert.match(pipeline, /initial-import-complete/, "the initial population pass must be durable across service restarts");
assert.match(pipeline, /initial-population/, "a first collection must publish its existing cache before collection finishes");
assert.match(pipeline, /final-reconciliation/, "every complete collection must receive a final import pass");
assert.match(pipeline, /discovery_pending.*discovery_failed/, "Coles discovery must finish before its final import");
assert.doesNotMatch(pipeline, /mass-import/, "the retailer-specific pipeline must not invoke the all-retailer mass importer");
assert.match(pipeline, /revisitAllCompleted=1/, "later runs must revisit the whole verified retailer taxonomy");
assert.match(pipeline, /collector is already running; attaching/, "deployment must attach to a live collection instead of restarting it");
assert.match(bridge, /revisit_all_completed=revisit_all_completed/, "Coles must pass the revisit request into its collector");
assert.match(service, /StateDirectory=food-retailer-catalogue/, "first-run import state must survive repository deployments");
assert.match(service, /run-retailer-catalogue-pipeline\.sh %i/, "the systemd template must run one retailer per service instance");

console.log("retailer catalogue pipeline tests passed");
