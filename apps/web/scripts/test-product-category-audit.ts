import assert from "node:assert/strict";
import { ProductType } from "@prisma/client";
import { defaultProductTypeForDepartment, isProductTypeCompatibleWithDepartment } from "./product-category-audit-policy";

// Product form must not erase retailer taxonomy. These are normal grocery
// records, and were the source of false audit failures in the imported data.
assert.equal(isProductTypeCompatibleWithDepartment("Bakery", ProductType.PACKAGED), true);
assert.equal(isProductTypeCompatibleWithDepartment("Dairy & eggs", ProductType.PACKAGED), true);
assert.equal(isProductTypeCompatibleWithDepartment("Frozen", ProductType.PACKAGED), true);
assert.equal(isProductTypeCompatibleWithDepartment("Pantry", ProductType.OTHER), true);

// Specific physical types still catch an actual contradiction.
assert.equal(isProductTypeCompatibleWithDepartment("Bakery", ProductType.BEVERAGE), false);
assert.equal(isProductTypeCompatibleWithDepartment("Drinks", ProductType.HOUSEHOLD), false);
assert.equal(isProductTypeCompatibleWithDepartment("Meat & seafood", ProductType.SEAFOOD), true);
assert.equal(defaultProductTypeForDepartment("Drinks"), ProductType.BEVERAGE);

console.log("product category audit policy tests passed");
