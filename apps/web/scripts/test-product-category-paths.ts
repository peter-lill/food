import assert from "node:assert/strict";
import { retailerPathDepartment } from "../src/lib/products/product-category";

assert.equal(retailerPathDepartment("/category/general-merchandise"), "Other");
assert.equal(retailerPathDepartment("/category/drinks-1"), "Drinks");
assert.equal(retailerPathDepartment("/category/beer-1"), "Drinks");
assert.equal(retailerPathDepartment("/category/dairy"), "Dairy & eggs");
assert.equal(retailerPathDepartment("/products/fruits-vegetables/k/950000000"), "Fruit & vegetables");
assert.equal(retailerPathDepartment("/products/cleaning-household/k/1050000000"), "Household");
assert.equal(retailerPathDepartment("/category/ready-to-eat-meals"), "Deli");
assert.equal(retailerPathDepartment("/category/unknown"), null);

console.log("product category path tests passed");
