import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ProductType } from "@prisma/client";
import { canonicalWoolworthsDescription, categoryForWoolworthsPath, cleanBarcode, hasSuspiciousLabelTail, importEligibility, type CachedWoolworthsProduct } from "./woolworths-controlled-import-matching";
import { heroProductDescription } from "../src/lib/products/product-description";

const product: CachedWoolworthsProduct = {
  stockcode: "238473", barcode: "9300632064205", name: "Example Full Cream Milk 2L", price: 3.5, is_special: false,
  pack_size: "2L", image_url: "https://cdn.example/milk.jpg", category_path: "/shop/browse/dairy-eggs-fridge/milk",
  in_stock: 1, brand: "Example", description: "Milk", long_description: null, allergens: null, dietary_claims: null,
  detail_refreshed_at: 123,
};

assert.deepEqual(categoryForWoolworthsPath(product.category_path), { category: "Dairy & eggs", productType: ProductType.DAIRY });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/freezer/frozen-meals"), { category: "Frozen", productType: ProductType.FROZEN });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/meat-seafood-deli/meat/beef"), { category: "Meat & seafood", productType: ProductType.FRESH_MEAT });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/meat-seafood-deli/seafood/fish"), { category: "Meat & seafood", productType: ProductType.SEAFOOD });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/meat-seafood-deli/deli/deli-meats"), { category: "Deli", productType: ProductType.PACKAGED });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/meat-seafood-deli/deli-meats"), { category: "Deli", productType: ProductType.PACKAGED });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/pantry/snacks-confectionery/chocolate"), { category: "Confectionery", productType: ProductType.PACKAGED });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/pantry/cooking-sauces"), { category: "Pantry", productType: ProductType.PACKAGED });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/drinks/soft-drinks"), { category: "Drinks", productType: ProductType.BEVERAGE });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/liquor/beer"), { category: "Drinks", productType: ProductType.BEVERAGE });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/beauty/hair-care"), { category: "Health & personal care", productType: ProductType.PERSONAL_CARE });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/baby/nappies"), { category: "Baby", productType: ProductType.PACKAGED });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/cleaning-maintenance/air-fresheners"), { category: "Household", productType: ProductType.HOUSEHOLD });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/pet/dog-food"), { category: "Pet", productType: ProductType.PACKAGED });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/future-department/example"), { category: "Other", productType: ProductType.OTHER });
assert.deepEqual(importEligibility(product), { eligible: true, reason: null });
assert.match(importEligibility({ ...product, detail_refreshed_at: null }).reason ?? "", /rich Woolworths detail/);
assert.match(importEligibility({ ...product, in_stock: 0 }).reason ?? "", /out of stock/);
assert.equal(hasSuspiciousLabelTail("Pauls Zymil Lactose Free Low Fat Long Life Milk UHT 1L"), false);
assert.equal(hasSuspiciousLabelTail("PureHarvest Organic Almond Unsweetened Long Life Milk UH 1L"), true);
assert.match(importEligibility({ ...product, name: "PureHarvest Organic Almond Unsweetened Long Life Milk UH 1L" }).reason ?? "", /suspicious truncated label/);
assert.equal(cleanBarcode("93 00632 064205"), "9300632064205");
assert.equal(cleanBarcode("not-a-barcode"), null);
assert.equal(canonicalWoolworthsDescription({ ...product, brand: "Hans", description: "Hans", long_description: null }), null, "a brand-only retailer description must not be imported");
assert.equal(canonicalWoolworthsDescription({ ...product, brand: "Hans", description: "Hans", long_description: "Sliced devon from the deli." }), "Sliced devon from the deli.");
assert.equal(heroProductDescription("Hans", "Hans"), null, "legacy brand-only descriptions must not be rendered");

const importerSource = readFileSync(new URL("./import-woolworths-controlled.ts", import.meta.url), "utf8");
const productHubSource = readFileSync(new URL("../src/app/products/page.tsx", import.meta.url), "utf8");
assert.match(importerSource, /const importAll = process\.argv\.includes\("--all"\)/, "the importer must support a controlled full-cache run");
assert.match(importerSource, /while \(true\)[\s\S]*page\.nextOffset === null/, "bulk mode must read every bounded cache page");
assert.match(importerSource, /another record in this import has the same barcode/, "bulk mode must prevent duplicate barcode creation across pages");
assert.match(importerSource, /prisma\.storeProduct\.findMany/, "each bulk cache page must preload existing retailer listings");
assert.match(importerSource, /tx\.priceObservation\.createMany/, "each bulk cache page must write price observations in one database batch");
assert.match(importerSource, /UPDATE "StoreProduct" AS target/, "each bulk cache page must update retained retailer listings in one database statement");
assert.match(importerSource, /source\."active"::boolean/, "the bulk listing update must cast boolean parameters for PostgreSQL");
assert.match(importerSource, /Skip reasons:/, "bulk previews must summarise why cached records were withheld");
assert.match(importerSource, /canonicalWoolworthsDescription/, "the importer must exclude brand-only Woolworths descriptions");
assert.match(importerSource, /UPDATE "Product" AS target/, "retained listings must repair blank or brand-only canonical descriptions");
assert.match(productHubSource, /heroProductDescription\(product\.description, product\.brand\)/, "product cards must show a meaningful description rather than a brand fallback");

console.log("Woolworths controlled-import safeguards passed.");
