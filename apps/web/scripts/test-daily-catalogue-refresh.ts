import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../../../deploy/food-daily-catalogue.service", import.meta.url), "utf8");
assert.match(service, /User=peter/, "the daily job must run as the Food deployment user");
assert.match(service, /GROCERY_MCP_BRIDGE_URL=http:\/\/127\.0\.0\.1:8790/, "the job must address the local catalogue bridge");
assert.match(service, /StateDirectory=food-retailer-catalogue/, "durable catalogue checkpoints must survive deployments");
assert.match(service, /flock -n \/var\/lib\/food-retailer-catalogue\/daily-catalogue\.lock/, "daily runs must not overlap");
assert.match(service, /products:catalogues:mass-import -- --drakes-store=087 --apply/, "the job must refresh and import every supported retailer");
assert.match(service, /Restart=on-failure/, "a transient collection failure must be retried");
assert.match(service, /TimeoutStartSec=infinity/, "a verified browser collection may take longer than systemd's default timeout");

const timer = readFileSync(new URL("../../../deploy/food-daily-catalogue.timer", import.meta.url), "utf8");
assert.match(timer, /OnCalendar=\*-\*-\* 20:00:00/, "the daily job must avoid the Wednesday morning specials sweep");
assert.match(timer, /Persistent=true/, "a missed daily run must execute after the next server boot");
assert.match(timer, /Unit=food-daily-catalogue\.service/, "the timer must invoke the daily service");

console.log("Daily catalogue refresh schedule regressions passed.");