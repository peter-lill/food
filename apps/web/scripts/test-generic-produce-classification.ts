import assert from "node:assert/strict";
import { ProductType } from "@prisma/client";
import {
  isPreparedProduceName,
  produceProductType,
} from "../src/lib/products/generic-produce";
import { classifyGenericProduce } from "../src/lib/products/generic-produce-classification";
import { genericProduceComparisonKey, indexGenericProduceCandidates } from "./generic-produce-import-matching";

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

const drakesMandarins = classifyGenericProduce("Afourer Mandarins");
const aldiMandarins = classifyGenericProduce("Afourer Mandarins Loose", "approx. 0.13 kg per piece");
assert.ok(drakesMandarins);
assert.ok(aldiMandarins);
assert.equal(drakesMandarins.familyName, "Afourer Mandarins");
assert.equal(aldiMandarins.familyName, "Afourer Mandarins");
assert.equal(aldiMandarins.comparisonKey, drakesMandarins.comparisonKey, "loose and unqualified mandarins must share one price-comparison product");

const oneKiloBag = classifyGenericProduce("Afourer Mandarins 1kg Bag");
const twoKiloBag = classifyGenericProduce("Afourer Mandarins Bag", "2 kg bag");
assert.ok(oneKiloBag);
assert.ok(twoKiloBag);
assert.equal(oneKiloBag.familyKey, drakesMandarins.familyKey, "bagged mandarins must remain beneath the mandarin family");
assert.notEqual(oneKiloBag.comparisonKey, drakesMandarins.comparisonKey, "a bag must not be compared as a loose item");
assert.notEqual(oneKiloBag.comparisonKey, twoKiloBag.comparisonKey, "different bag weights must remain distinct variants");

const halfCabbage = classifyGenericProduce("Cabbage Half");
const wholeCabbage = classifyGenericProduce("Cabbage Whole Each");
const redCabbage = classifyGenericProduce("Red Cabbage Half");
assert.ok(halfCabbage);
assert.ok(wholeCabbage);
assert.ok(redCabbage);
assert.equal(halfCabbage.familyName, "Cabbage");
assert.equal(wholeCabbage.familyName, "Cabbage");
assert.notEqual(halfCabbage.comparisonKey, wholeCabbage.comparisonKey, "half and whole cabbage must remain distinct sellable variants");
assert.notEqual(redCabbage.familyKey, halfCabbage.familyKey, "red cabbage must not collapse into plain cabbage");
assert.equal(classifyGenericProduce("Coles Broccoli Medium approx. 340g")?.comparisonKey, classifyGenericProduce("Broccoli Each")?.comparisonKey);
assert.equal(classifyGenericProduce("Coles Cauliflower Full 1 Each")?.familyName, "Cauliflower");
assert.equal(classifyGenericProduce("Coles Sliced Mushrooms")?.familyName, "Button Mushroom");

assert.equal(classifyGenericProduce("Cadbury Dairy Milk Chocolate 180g"), null, "packaged products must never enter produce matching");
assert.equal(genericProduceComparisonKey("Afourer Mandarins Loose", null, false), null, "retailer category evidence is required during import");

const existing = indexGenericProduceCandidates([
  { id: "preferred", name: "Afourer Mandarins", canonicalName: null, packSize: null },
  { id: "duplicate", name: "Afourer Mandarins Loose", canonicalName: null, packSize: null },
  { id: "prepared", name: "Garlic Szechuan Stir Fry Kit", canonicalName: null, packSize: "350g" },
]);
assert.equal(existing.get(aldiMandarins.comparisonKey), "preferred", "the importer must deterministically attach later retailer listings to the preferred existing product");
assert.equal(existing.has(classifyGenericProduce("Garlic")!.comparisonKey), false, "prepared produce must never become a generic-produce merge candidate");

console.log("Generic produce family and sellable-variant regressions passed.");
