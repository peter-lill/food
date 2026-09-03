import assert from "node:assert/strict";
import { retailerPathDepartment } from "../src/lib/products/product-category";

assert.equal(retailerPathDepartment("/category/general-merchandise"), "Other");
assert.equal(retailerPathDepartment("/category/dairy"), "Dairy & eggs");
assert.equal(retailerPathDepartment("/category/unknown"), null);

console.log("product category path tests passed");
