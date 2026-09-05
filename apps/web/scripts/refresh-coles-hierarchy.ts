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
const pollSeconds = Math.max(5, Math.min(120, Number(argument("--poll-seconds") ?? "30") || 30));
const selectedRoots = requestedRoot ? roots.filter((root) => root === requestedRoot) : [...roots];
if (requestedRoot && !selectedRoots.length) throw new Error(`Unknown Coles root: ${requestedRoot}`);

type JsonObject = Record<string, unknown>;
type CachedProduct = { category_path?: unknown; category_paths?: unknown };

async function request(pathname: string, parameters: Record<string, string> = {}) {
  const url = new URL(pathname, bridgeUrl);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({})) as JsonObject;
  if (!response.ok || payload.status === "error") throw new Error(`${pathname} failed: ${String(payload.error ?? `HTTP ${response.status}`)}`);
  return payload;
}

function collection(payload: JsonObject) {
  return payload.collection && typeof payload.collection === "object" ? payload.collection as JsonObject : payload;
}
function count(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function isBrowsePath(value: unknown): value is string {
  return typeof value === "string" && /^\/browse\/[a-z0-9-]+(?:\/[a-z0-9-]+)+$/i.test(value.trim());
}
function belongsToSelectedRoot(path: string) {
  return selectedRoots.some((root) => path.startsWith(`${root}/`));
}

async function waitForRootCollection() {
  const start = await request("/coles/catalogue/collection/start");
  console.log(`Coles root collection requested; started=${String(start.started ?? true)}.`);
  while (true) {
    const status = collection(await request("/coles/catalogue/collection/status"));
    const running = count(status.running); const failed = count(status.failed);
    const completed = count(status.completed); const total = count(status.total);
    console.log(`Coles roots: completed=${completed}/${total}, failed=${failed}, running=${running}.`);
    if (!running) {
      if (failed) throw new Error(`Coles root collection finished with ${failed} failed categories.`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
  }
}

async function discoverCachedPaths() {
  const paths = new Set<string>();
  let offset = 0;
  while (true) {
    const payload = await request("/coles/catalogue/products", { limit: "1000", offset: String(offset) });
    const products = Array.isArray(payload.products) ? payload.products as CachedProduct[] : [];
    for (const product of products) {
      const candidates = [product.category_path, ...(Array.isArray(product.category_paths) ? product.category_paths : [])];
      for (const candidate of candidates) if (isBrowsePath(candidate) && belongsToSelectedRoot(candidate)) paths.add(candidate.replace(/\/$/, ""));
    }
    const next = typeof payload.nextOffset === "number" ? payload.nextOffset : null;
    if (next === null || next <= offset) break;
    offset = next;
  }
  return paths;
}

async function main() {
  if (!skipRoots) await waitForRootCollection();

  const completed = new Set<string>();
  let round = 0;
  while (true) {
    round += 1;
    const discovered = await discoverCachedPaths();
    const pending = [...discovered]
      .filter((path) => !completed.has(path))
      .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
    if (!pending.length) break;
    console.log(`Hierarchy round ${round}: ${pending.length} category paths discovered.`);

    for (const category of pending) {
      if (maxCategories > 0 && completed.size >= maxCategories) {
        console.log(`Stopped after ${completed.size} category refreshes because --max-categories=${maxCategories}.`);
        return;
      }
      console.log(`Refreshing ${category}.`);
      const result = await request("/coles/catalogue/refresh", { category, resume: "true" });
      console.log(`Completed ${category}: ${String(result.products ?? "unknown")} cached products.`);
      completed.add(category);
    }
  }

  console.log(`Coles hierarchical refresh complete: ${completed.size} individual category paths refreshed after the root catalogue pass.`);
  console.log("The controlled Food import remains a separate step; this command only refreshes the verified Coles cache.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
