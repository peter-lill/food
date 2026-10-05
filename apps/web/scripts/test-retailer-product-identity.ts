import assert from "node:assert/strict";

import {
  comparablePackSize,
  comparableRetailProductKey,
  sameComparableRetailProduct,
} from "../src/lib/products/retailer-product-identity";

assert.equal(comparablePackSize("1.25L bottle"), "1250ml");
assert.equal(comparablePackSize("10 x 375mL cans"), "10x375ml");
assert.equal(comparablePackSize("4 pack"), "4pack");

const pepsiWoolworths = {
  name: "Pepsi Max Soft Drink Bottle 1.25L",
  canonicalName: "Pepsi Max Soft Drink Bottle 1.25L",
  brand: "Pepsi",
  packSize: "1.25L",
  barcode: "9300675004932",
};
const pepsiDrakes = {
  name: "Pepsi Max 1.25L",
  canonicalName: "Pepsi Max 1.25L",
  brand: "Pepsi",
  packSize: "1.25L",
  barcode: null,
};
assert.equal(
  sameComparableRetailProduct(pepsiWoolworths, pepsiDrakes),
  true,
  "the same branded variant and pack must compare across retailers even when one retailer omits the barcode",
);

assert.equal(
  sameComparableRetailProduct(
    { name: "Coca-Cola No Sugar Soft Drink Bottle 1.25L", brand: "Coca-Cola", packSize: "1.25L" },
    { name: "Coca-Cola Classic 1.25L", brand: "Coca-Cola", packSize: "1.25L" },
  ),
  false,
  "different branded variants must never collapse merely because their pack size matches",
);

assert.equal(
  sameComparableRetailProduct(
    { name: "Pepsi Max 1.25L", brand: "Pepsi", packSize: "1.25L" },
    { name: "Pepsi Max 2L", brand: "Pepsi", packSize: "2L" },
  ),
  false,
  "different sellable pack sizes must remain distinct",
);

assert.equal(
  comparableRetailProductKey({ name: "Milk 2L", brand: null, packSize: "2L" }),
  null,
  "unbranded catalogue products must not be fuzzy-merged by the packaged matcher",
);

assert.equal(
  sameComparableRetailProduct(
    { name: "Example Product 500g", brand: "Example", packSize: "500g", barcode: "9300000000001" },
    { name: "Example Product 500g", brand: "Example", packSize: "500g", barcode: "9300000000002" },
  ),
  false,
  "conflicting known barcodes are authoritative evidence that products are distinct",
);

console.log("Cross-retailer product identity regressions passed.");
