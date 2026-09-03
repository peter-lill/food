import "dotenv/config";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const apply = process.argv.includes("--apply");
const drakesStore = process.argv.find((argument) => argument.startsWith("--drakes-store="))?.slice("--drakes-store=".length).toLowerCase() ?? "";

if (!apply) throw new Error("This command changes catalogue records. Pass --apply after refreshing the ALDI and selected Drakes catalogue caches.");
if (!/^[a-z0-9-]{1,64}$/.test(drakesStore)) throw new Error("Pass --drakes-store=089 for the selected Drakes store.");
if (!process.env.GROCERY_MCP_BRIDGE_URL?.trim()) throw new Error("GROCERY_MCP_BRIDGE_URL is required to import the current retailer catalogues.");

const tsxCli = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
if (!existsSync(tsxCli)) throw new Error("The local tsx runtime is missing. Run npm ci before synchronising catalogues.");

function run(script: string, args: string[]) {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawn(process.execPath, [tsxCli, script, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${script} ${signal ? `was terminated by ${signal}` : `exited with code ${code ?? "unknown"}`}.`));
    });
  });
}

async function main() {
  console.log(`Synchronising ALDI and Drakes catalogue categories for Drakes store ${drakesStore}.`);
  // Importers update retained listings as well as new ones. This writes the
  // retailer category path before the category reconciler evaluates it.
  await run("scripts/import-aldi-controlled.ts", ["--all", "--apply"]);
  await run("scripts/import-drakes-controlled.ts", [`--store=${drakesStore}`, "--all", "--apply"]);
  await run("scripts/backfill-imported-catalogue-paths.ts", [`--drakes-store=${drakesStore}`, "--apply"]);
  await run("scripts/reconcile-imported-categories.ts", ["--apply"]);
  await run("scripts/reconcile-product-categories.ts", ["--apply"]);
  await run("scripts/audit-product-categories.ts", ["--strict", "--limit=200"]);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
