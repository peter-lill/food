import { readFile } from "node:fs/promises";

const BRIDGE = process.env.GROCERY_MCP_BRIDGE_URL || "http://localhost:8790";
const MANIFEST = new URL("./woolworths-core-categories.json", import.meta.url);

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 3000, 8000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function refreshCategory(category) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt - 1]) {
      await sleep(BACKOFF_MS[attempt - 1]);
    }

    const url = new URL("/woolworths/catalogue/refresh", BRIDGE);
    url.searchParams.set("category", category);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15 * 60 * 1000),
      });

      const text = await response.text();
      let payload;

      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }

      if (response.ok && payload?.status === "success") {
        return {
          ok: true,
          category,
          attempt,
          products: payload.products ?? 0,
          detailsEnriched: payload.detailsEnriched ?? 0,
          detailsFailed: payload.detailsFailed ?? 0,
          detailError: payload.detailError ?? null,
        };
      }

      const retryable =
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 429;

      lastError = `HTTP ${response.status}: ${payload?.error || text || "unknown error"}`;

      if (!retryable) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ok: false,
    category,
    error: lastError || "unknown failure",
  };
}

async function getStatus() {
  const response = await fetch(
    new URL("/woolworths/catalogue/status", BRIDGE),
    { signal: AbortSignal.timeout(30000) }
  );

  if (!response.ok) {
    throw new Error(`Catalogue status failed with HTTP ${response.status}`);
  }

  return response.json();
}

const categories = JSON.parse(await readFile(MANIFEST, "utf8"));

if (!Array.isArray(categories) || categories.length === 0) {
  throw new Error("Woolworths core category manifest is empty or invalid.");
}

const seen = new Set();
for (const category of categories) {
  if (
    typeof category !== "string" ||
    !category.startsWith("/shop/browse/")
  ) {
    throw new Error(`Invalid Woolworths category: ${JSON.stringify(category)}`);
  }

  if (seen.has(category)) {
    throw new Error(`Duplicate Woolworths category: ${category}`);
  }

  seen.add(category);
}

console.log(`Woolworths core catalogue refresh`);
console.log(`Bridge: ${BRIDGE}`);
console.log(`Categories: ${categories.length}`);

const results = [];

for (let index = 0; index < categories.length; index++) {
  const category = categories[index];

  console.log();
  console.log(`[${index + 1}/${categories.length}] ${category}`);

  const result = await refreshCategory(category);
  results.push(result);

  if (result.ok) {
    console.log(
      `  ✓ ${result.products} products · ` +
      `${result.detailsEnriched} detailed · ` +
      `${result.detailsFailed} detail failures` +
      (result.attempt > 1 ? ` · attempt ${result.attempt}` : "")
    );
  } else {
    console.error(`  ✗ ${result.error}`);
  }
}

console.log();
console.log("=== FINAL CATALOGUE STATUS ===");

let status = null;

try {
  status = await getStatus();
  console.log(JSON.stringify(status, null, 2));
} catch (error) {
  console.error(
    `Unable to read final catalogue status: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

console.log();
console.log("=== REFRESH SUMMARY ===");

for (const result of results) {
  if (result.ok) {
    console.log(
      `✓ ${result.category} — ${result.products} products, ` +
      `${result.detailsEnriched} detailed, ${result.detailsFailed} failed`
    );
  } else {
    console.log(`✗ ${result.category} — ${result.error}`);
  }
}

const failures = results.filter((result) => !result.ok);

console.log();
console.log(
  `${results.length - failures.length}/${results.length} categories succeeded`
);

if (status?.products !== undefined) {
  console.log(
    `Catalogue: ${status.products} products · ` +
    `${status.categories ?? "?"} categories · ` +
    `${status.detailedProducts ?? "?"} detailed · ` +
    `${status.detailFailures ?? "?"} detail failures`
  );
}

if (failures.length > 0) {
  process.exitCode = 1;
}
