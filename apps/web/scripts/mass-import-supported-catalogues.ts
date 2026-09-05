import "dotenv/config";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const apply = process.argv.includes("--apply");
const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const drakesStore = argument("--drakes-store")?.trim().toLowerCase() ?? "";
const resumeColes = argument("--resume-coles")?.trim() ?? "";
const requestedColesDelay = Number(argument("--coles-delay-seconds") ?? "10");
const colesDelaySeconds = Number.isFinite(requestedColesDelay) && requestedColesDelay >= 0 && requestedColesDelay <= 60
  ? requestedColesDelay
  : 10;
if (!apply) throw new Error("This workflow changes catalogue records. Pass --apply.");
if (!/^[a-z0-9-]{1,64}$/.test(drakesStore)) throw new Error("Pass the selected Drakes store, for example --drakes-store=089.");

const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
if (!bridgeUrl) throw new Error("GROCERY_MCP_BRIDGE_URL is required.");

const colesCategories = [
  "/browse/meat-seafood", "/browse/fruit-vegetables", "/browse/dairy-eggs-fridge",
  "/browse/bakery", "/browse/deli", "/browse/pantry", "/browse/dietary-world-foods",
  "/browse/chips-chocolates-snacks", "/browse/drinks", "/browse/frozen",
  "/browse/cleaning-laundry", "/browse/health-beauty", "/browse/baby",
  "/browse/pet", "/browse/home-garden",
] as const;
const resumeIndex = resumeColes ? colesCategories.indexOf(resumeColes as typeof colesCategories[number]) : 0;
if (resumeColes && resumeIndex < 0) {
  throw new Error(`Unknown Coles resume category: ${resumeColes}.`);
}

type JsonObject = Record<string, unknown>;
async function request(pathname: string, parameters: Record<string, string> = {}) {
  const url = new URL(pathname, bridgeUrl);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({})) as JsonObject;
  if (!response.ok || payload.status === "error") throw new Error(`${pathname} failed: ${String(payload.error ?? `HTTP ${response.status}`)}`);
  return payload;
}

const tsxCli = [
  resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
  resolve(process.cwd(), "..", "..", "node_modules", "tsx", "dist", "cli.mjs"),
].find(existsSync);
if (!tsxCli) throw new Error("The local tsx runtime is missing. Run npm ci first.");

function run(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [tsxCli!, script, ...args], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} exited with code ${result.status ?? "unknown"}.`);
}

function collectionCounts(payload: JsonObject) {
  const collection = payload.collection && typeof payload.collection === "object" ? payload.collection as JsonObject : payload;
  const count = (name: string) => typeof collection[name] === "number" ? collection[name] as number : 0;
  return { pending: count("pending"), running: count("running"), failed: count("failed"), completed: count("completed"), total: count("total") };
}

async function waitForWoolworths() {
  const start = await request("/woolworths/catalogue/collection/start", { revisitAllCompleted: "1", retryFailed: "1" });
  console.log(`Woolworths collection requested: ${JSON.stringify(collectionCounts(start))}.`);
  const deadline = Date.now() + 6 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    const status = await request("/woolworths/catalogue/collection/status");
    const counts = collectionCounts(status);
    console.log(`Woolworths collection: ${JSON.stringify(counts)}.`);
    if (counts.pending === 0 && counts.running === 0) {
      if (counts.failed > 0 || counts.completed !== counts.total) throw new Error(`Woolworths collection finished incompletely: ${JSON.stringify(counts)}.`);
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 30_000));
  }
  throw new Error("Woolworths collection did not finish within six hours.");
}

async function main() {
  await request("/health");
  if (!resumeColes) {
    console.log("Refreshing complete ALDI catalogue.");
    await request("/aldi/catalogue/refresh", { allDepartments: "true" });
    console.log(`Refreshing complete Drakes catalogue for store ${drakesStore}.`);
    await request("/drakes/catalogue/refresh", { storeId: drakesStore, allDepartments: "true" });
  } else {
    console.log(`Resuming Coles at ${resumeColes}; retaining the completed ALDI and Drakes cache refreshes.`);
  }

  const remainingColesCategories = colesCategories.slice(resumeIndex);
  for (const [index, category] of remainingColesCategories.entries()) {
    console.log(`Refreshing Coles ${category}.`);
    try {
      await request("/coles/catalogue/refresh", { category });
    } catch (error) {
      throw new Error(
        `Coles stopped at ${category}. Open the verified Firefox session through noVNC, complete the Coles verification, then rerun with --resume-coles=${category}. Cause: ${String(error)}`,
      );
    }
    if (colesDelaySeconds > 0 && index < remainingColesCategories.length - 1) {
      console.log(`Waiting ${colesDelaySeconds} seconds before the next Coles category.`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, colesDelaySeconds * 1_000));
    }
  }
  await waitForWoolworths();

  run("scripts/import-coles-controlled.ts", ["--all", "--apply"]);
  run("scripts/import-woolworths-controlled.ts", ["--all", "--apply"]);
  run("scripts/sync-imported-retailer-catalogues.ts", [`--drakes-store=${drakesStore}`, "--apply"]);
  run("scripts/audit-product-categories.ts", ["--strict", "--limit=200"]);
  console.log("Supported retailer mass import completed: Coles, Woolworths, ALDI and Drakes.");
  console.log("IGA was not included because no verified selected-store IGA catalogue provider is implemented.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
