import assert from "node:assert/strict";
import { ProductType } from "@prisma/client";
import { canonicalColesDescription, categoryForColesPath, colesImportEligibility } from "./coles-controlled-import-matching";

assert.deepEqual(categoryForColesPath("/browse/fruit-vegetables"), { category: "Fruit & vegetables", productType: ProductType.GENERIC_PRODUCE });
assert.deepEqual(categoryForColesPath("/browse/chips-chocolates-snacks"), { category: "Confectionery", productType: ProductType.PACKAGED });
assert.deepEqual(categoryForColesPath("/browse/home-garden"), { category: "Other", productType: ProductType.OTHER });

const product = { external_id: "5428639", barcode: "9300601978519", name: "Coles Simply Table Spread 1kg", brand: "Coles Simply", description: "Coles Simply", long_description: "Everyday table spread.", pack_size: "1kg", price: 4, was_price: null, is_special: false, in_stock: true, image_url: null, category_path: "/browse/dairy-eggs-fridge", category_paths: ["/browse/dairy-eggs-fridge"] };
assert.deepEqual(colesImportEligibility(product), { eligible: true, reason: null });
assert.equal(canonicalColesDescription(product), "Everyday table spread.");
assert.equal(colesImportEligibility({ ...product, category_path: "/search" }).eligible, false);
assert.equal(colesImportEligibility({ ...product, in_stock: false }).eligible, false);

console.log("Coles controlled import tests passed");
