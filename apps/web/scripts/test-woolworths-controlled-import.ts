import assert from "node:assert/strict";
import { ProductType } from "@prisma/client";
import { categoryForWoolworthsPath, cleanBarcode, hasSuspiciousLabelTail, importEligibility, type CachedWoolworthsProduct } from "./woolworths-controlled-import-matching";

const product: CachedWoolworthsProduct = {
  stockcode: "238473", barcode: "9300632064205", name: "Example Full Cream Milk 2L", price: 3.5,
  pack_size: "2L", image_url: "https://cdn.example/milk.jpg", category_path: "/shop/browse/dairy-eggs-fridge/milk",
  in_stock: 1, brand: "Example", description: "Milk", long_description: null, allergens: null, dietary_claims: null,
  detail_refreshed_at: 123,
};

assert.deepEqual(categoryForWoolworthsPath(product.category_path), { category: "Dairy & eggs", productType: ProductType.DAIRY });
assert.deepEqual(categoryForWoolworthsPath("/shop/browse/freezer/frozen-meals"), { category: "Frozen", productType: ProductType.FROZEN });
assert.deepEqual(importEligibility(product), { eligible: true, reason: null });
assert.match(importEligibility({ ...product, detail_refreshed_at: null }).reason ?? "", /rich Woolworths detail/);
assert.match(importEligibility({ ...product, in_stock: 0 }).reason ?? "", /out of stock/);
assert.equal(hasSuspiciousLabelTail("Pauls Zymil Lactose Free Low Fat Long Life Milk UHT 1L"), false);
assert.equal(hasSuspiciousLabelTail("PureHarvest Organic Almond Unsweetened Long Life Milk UH 1L"), true);
assert.match(importEligibility({ ...product, name: "PureHarvest Organic Almond Unsweetened Long Life Milk UH 1L" }).reason ?? "", /suspicious truncated label/);
assert.equal(cleanBarcode("93 00632 064205"), "9300632064205");
assert.equal(cleanBarcode("not-a-barcode"), null);

console.log("Woolworths controlled-import safeguards passed.");
