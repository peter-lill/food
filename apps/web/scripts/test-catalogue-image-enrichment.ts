import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helper = readFileSync(new URL("../src/lib/products/catalogue-image-enrichment.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/lib/jobs/worker-handlers.ts", import.meta.url), "utf8");
const backfill = readFileSync(new URL("backfill-missing-catalogue-images.ts", import.meta.url), "utf8");

assert.match(helper, /product\."imageUrl" IS NULL/, "retailer images must not replace an existing curated product image");
assert.match(helper, /catalogue-product-image:\$\{product\.id\}/, "missing-image recovery jobs must deduplicate per product");
assert.match(helper, /allowGenerated: false/, "catalogue backfill must prefer authoritative images and avoid bulk generated-image work");
assert.match(worker, /allowGenerated: payload\.allowGenerated !== false/, "the worker must honour the catalogue no-generation policy");
assert.match(backfill, /DISTINCT ON \(listing\."productId"\)/, "the backfill must promote the freshest retailer image once per product");
assert.match(backfill, /enqueueMissingCatalogueProductImages/, "the backfill must queue products that have no retailer image to promote");
assert.doesNotMatch(backfill, /allowGenerated:\s*true/, "the catalogue backfill must not opt into generated images");

for (const retailer of ["woolworths", "coles", "aldi", "drakes"] as const) {
  const importer = readFileSync(new URL(`import-${retailer}-controlled.ts`, import.meta.url), "utf8");
  assert.match(importer, /promoteCatalogueProductImages/, `${retailer} imports must promote retailer images to the shared product`);
  assert.match(importer, /enqueueMissingCatalogueProductImages/, `${retailer} imports must queue unresolved images without a product-page visit`);
}

console.log("catalogue image enrichment regression passed");
