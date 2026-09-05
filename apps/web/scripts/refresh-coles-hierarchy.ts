import "dotenv/config";

const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
if (!bridgeUrl) throw new Error("GROCERY_MCP_BRIDGE_URL is required.");

const roots = [
  "/browse/meat-seafood", "/browse/fruit-vegetables", "/browse/dairy-eggs-fridge",
  "/browse/bakery", "/browse/deli", "/browse/pantry", "/browse/dietary-world-foods",
  "/browse/chips-chocolates-snacks", "/browse/drinks", "/browse/frozen",
  "/browse/cleaning-laundry", "/browse/health-beauty", "/browse/baby",
  "/browse/pet", "/browse/home-garden",
] as const;

const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requestedRoot = argument("--root")?.trim() ?? "";
const skipRoots = process.argv.includes("--skip-roots");
const maxCategories = Number(argument("--max-categories") ?? "0");
const selectedRoots = requestedRoot ? roots.filter((root) => root === requestedRoot) : [...roots];
if (requestedRoot && !selectedRoots.length) throw new Error(`Unknown Coles root: ${requestedRoot}`);

type JsonObject = Record<string, unknown>;

async function request(pathname: string, parameters: Record<string, string> = {}) {
  const url = new URL(pathname, bridgeUrl);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({})) as JsonObject;
  if (!response.ok || payload.status === "error") throw new Error(`${pathname} failed: ${String(payload.error ?? `HTTP ${response.status}`)}`);
  return payload;
}

function isBrowsePath(value: string) { return /^\/browse\/[a-z0-9-]+(?:\/[a-z0-9-]+)+$/i.test(value); }
function belongsTo(root: string, path: string) { return path.startsWith(`${root}/`); }

async function discoverFromPublicBrowse(root: string) {
  const response = await fetch(`https://www.coles.com.au${root}`, { headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error(`Unable to discover Coles categories from ${root}: HTTP ${response.status}`);
  const html = await response.text();
  const paths = new Set<string>();
  const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:href=["']|\\\\"url\\\\":\\\\")(${escapedRoot}/[a-z0-9-]+(?:/[a-z0-9-]+)*)`, "gi");
  for (const match of html.matchAll(pattern)) {
    const path = match[1]?.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/\/$/, "");
    if (path && isBrowsePath(path) && belongsTo(root, path)) paths.add(path);
  }
  return paths;
}

async function main() {
  const queue: string[] = [];
  const queued = new Set<string>();
  const completed = new Set<string>();

  for (const root of selectedRoots) {
    if (!skipRoots) {
      console.log(`Refreshing root ${root}.`);
      const result = await request("/coles/catalogue/refresh", { category: root, resume: "true" });
      console.log(`Completed root ${root}: ${String(result.products ?? "unknown")} cached products.`);
    }
    const discovered = await discoverFromPublicBrowse(root);
    console.log(`Discovered ${discovered.size} category paths beneath ${root}.`);
    for (const path of discovered) if (!queued.has(path)) { queue.push(path); queued.add(path); }
  }

  queue.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  if (!queue.length) throw new Error("No Coles child category paths were discovered. Nothing was refreshed.");

  while (queue.length) {
    if (maxCategories > 0 && completed.size >= maxCategories) {
      console.log(`Stopped after ${completed.size} category refreshes because --max-categories=${maxCategories}.`);
      break;
    }
    const category = queue.shift()!;
    if (completed.has(category)) continue;
    console.log(`Refreshing ${category}.`);
    const result = await request("/coles/catalogue/refresh", { category, resume: "true" });
    console.log(`Completed ${category}: ${String(result.products ?? "unknown")} cached products.`);
    completed.add(category);

    // Each category page can expose another level (for example Pasta/Rice -> Rice -> rice subtypes).
    const children = await discoverFromPublicBrowse(category);
    for (const child of children) {
      if (!completed.has(child) && !queued.has(child)) { queue.push(child); queued.add(child); }
    }
    queue.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  }

  console.log(`Coles hierarchical refresh complete: ${completed.size} individual category paths refreshed.`);
  console.log("The controlled Food import remains a separate step; this command only refreshes the verified Coles cache.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
