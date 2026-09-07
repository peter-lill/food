import assert from "node:assert/strict";
import { ProductType } from "@prisma/client";
import {
  isPreparedProduceName,
  produceProductType,
} from "../src/lib/products/generic-produce";

// No name evidence preserves the produce-department default.
assert.equal(produceProductType(""), ProductType.GENERIC_PRODUCE);

// Ordinary produce identities remain generic regardless of retailer naming,
// variety, sale unit or simple pack size.
for (const name of [
  "Broccoli",
  "Fresh Broccoli",
  "Broccoli Loose",
  "Broccolini Bunch",
  "Carrots 1kg",
  "Carrots Loose",
  "Cauliflower Each",
  "Afourer Mandarins",
  "Afourer Mandarins 750g",
  "Apple Cosmic Crisp each",
  "Apple Granny Smith Medium",
  "Orange Navel",
  "Kestrel Washed Potatoes",
  "Cocktail Truss Tomatoes 250g",
"Garlic",
"Fresh Garlic",
"Garlic Bulb",
"Ginger",
"Fresh Ginger",
"Ginger Root",
]) {
  assert.equal(
    produceProductType(name),
    ProductType.GENERIC_PRODUCE,
    `${name} should remain ordinary produce`,
  );
}

// Prepared/value-added produce is a packaged product.
for (const name of [
  "Fresh & Fast Stir Fry 400g",
  "Asian Style Salad Kit 350g",
  "Garlic Szechuan Stir Fry Kit 350g",
  "Classic Coleslaw Salad",
  "Woolworths Caesar Salad Bowl 200g",
  "Woolworths COOK Pumpkin & Veg Soup Kit 450g",
  "Community Co Fine Cut Stir Fry 335g",
  "Community Co Caesar Salad Kit 290g",
  "Garlic Cold Blended Paste",
]) {
  assert.equal(
    produceProductType(name),
    ProductType.PACKAGED,
    `${name} should be packaged produce`,
  );
  assert.equal(isPreparedProduceName(name), true);
}

console.log("Generic produce classification safeguards passed.");
