import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("sync-imported-retailer-catalogues.ts", import.meta.url), "utf8");

assert.match(source, /--drakes-store=089/, "the sync command must require an explicit selected Drakes store");
assert.match(source, /import-aldi-controlled\.ts", \["--all", "--apply"\]/, "the sync must write current ALDI category paths before reconciliation");
assert.match(source, /import-drakes-controlled\.ts", \[`--store=\$\{drakesStore\}`, "--all", "--apply"\]/, "the sync must write selected-store Drakes category paths before reconciliation");
assert.match(source, /backfill-imported-catalogue-paths\.ts/, "the sync must recover legacy retailer listings after current imports");
assert.match(source, /reconcile-imported-categories\.ts", \["--apply"\]/, "the sync must reconcile categories only after paths are written");
assert.match(source, /audit-product-categories\.ts", \["--strict", "--limit=200"\]/, "the sync must finish with the strict category audit");

console.log("imported retailer catalogue sync safeguards passed");
