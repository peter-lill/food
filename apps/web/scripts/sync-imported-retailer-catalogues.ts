import "dotenv/config";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const apply = process.argv.includes("--apply");
const drakesStore = process.argv.find((argument) => argument.startsWith("--drakes-store="))?.slice("--drakes-store=".length).toLowerCase() ?? "";

if (!apply) throw new Error("This command changes catalogue records. Pass --apply after refreshing the ALDI and selected Drakes catalogue caches.");
if (!/^[a-z0-9-]{1,64}$/.test(drakesStore)) throw new Error("Pass --drakes-store=089 for the selected Drakes store.");
if (!process.env.GROCERY_MCP_BRIDGE_URL?.trim()) throw new Error("GROCERY_MCP_BRIDGE_URL is required to import the current retailer catalogues.");

// npm runs a workspace script from apps/web while dependencies are hoisted at
// the repository root. Support both a standalone workspace install and the
// normal monorepo layout.
const tsxCli = [
  resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
  resolve(process.cwd(), "..", "..", "node_modules", "tsx", "dist", "cli.mjs"),
].find(existsSync);
if (!tsxCli) throw new Error("The local tsx runtime is missing. Run npm ci before synchronising catalogues.");
const tsxCliPath: string = tsxCli;

function run(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [tsxCliPath, script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} ${result.signal ? `was terminated by ${result.signal}` : `exited with code ${result.status ?? "unknown"}`}.`);
}

function main() {
  console.log(`Synchronising ALDI and Drakes catalogue categories for Drakes store ${drakesStore}.`);
  // Importers update retained listings as well as new ones. This writes the
  // retailer category path before the category reconciler evaluates it.
  run("scripts/import-aldi-controlled.ts", ["--all", "--apply"]);
  run("scripts/import-drakes-controlled.ts", [`--store=${drakesStore}`, "--all", "--apply"]);
  run("scripts/backfill-imported-catalogue-paths.ts", [`--drakes-store=${drakesStore}`, "--apply"]);
  run("scripts/reconcile-imported-categories.ts", ["--apply"]);
  run("scripts/reconcile-product-categories.ts", ["--apply"]);
  run("scripts/audit-product-categories.ts", ["--strict", "--limit=200"]);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
