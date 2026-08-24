import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sweep = readFileSync(new URL("../../../scripts/refresh-weekly-specials.sh", import.meta.url), "utf8");
assert.match(sweep, /collection\/start\?revisitAllCompleted=1&retryFailed=1/, "the Wednesday sweep must revisit verified catalogue categories before importing specials");
assert.match(sweep, /collection\/status/, "the Wednesday sweep must wait for durable catalogue completion");
assert.match(sweep, /if \[\[ \"\$failed\" != \"0\" \]\]/, "a failed category must stop the sweep before it imports partial data");
assert.match(sweep, /max_wait_minutes/, "the Wednesday sweep must have a bounded wait time");
assert.match(sweep, /products:woolworths-import -- --all --page-size=1000 --apply/, "the completed catalogue must be imported with current special flags");
assert.match(sweep, /products:retailer-prices -- --apply --stale-days=\"\$stale_days\"/, "stale retailer prices must be queued after the catalogue import");

const service = readFileSync(new URL("../../../deploy/food-weekly-specials-refresh.service", import.meta.url), "utf8");
assert.match(service, /User=peter/, "the scheduled sweep must run as the Food deployment user");
assert.match(service, /refresh-weekly-specials\.sh/, "the service must execute the bounded sweep script");

const timer = readFileSync(new URL("../../../deploy/food-weekly-specials-refresh.timer", import.meta.url), "utf8");
assert.match(timer, /OnCalendar=Wed \*-\*-\* 05:30:00/, "the timer must run each Wednesday morning in the server timezone");
assert.match(timer, /Persistent=true/, "a missed Wednesday should run after the next server boot");

console.log("Weekly specials sweep regressions passed.");
