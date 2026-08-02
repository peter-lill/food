import assert from "node:assert/strict";
import { parseAustralianNip } from "../src/lib/product-intelligence/australian-nip-parser";

const fixtures = [
  {
    name: "standard Australian solid panel",
    source: `
      <h2>NUTRITION INFORMATION</h2>
      <p>Servings per package: 9</p>
      <p>Serving size: 17.2 g</p>
      <table>
        <tr><th>Energy</th><td>389 kJ</td><td>2263 kJ</td></tr>
        <tr><th>Protein</th><td>0.8 g</td><td>4.5 g</td></tr>
        <tr><th>Fat, total</th><td>5.5 g</td><td>31.8 g</td></tr>
        <tr><th>- saturated</th><td>3.1 g</td><td>18.2 g</td></tr>
        <tr><th>Carbohydrate</th><td>9.4 g</td><td>54.5 g</td></tr>
        <tr><th>- sugars</th><td>7.8 g</td><td>45.5 g</td></tr>
        <tr><th>Dietary fibre</th><td>0.0 g</td><td>0.0 g</td></tr>
        <tr><th>Sodium</th><td>12.5 mg</td><td>72.7 mg</td></tr>
      </table>
      <p>Ingredients: Sugar, milk solids, cocoa butter.</p>
      <p>Contains: Milk, Soy, Wheat</p>
      <p>May contain: Tree Nuts</p>
    `,
    verify(result: ReturnType<typeof parseAustralianNip>) {
      assert(result);
      assert.equal(result.servingsPerPackage, 9);
      assert.equal(result.servingQuantity, 17.2);
      assert.equal(result.servingUnit, "g");
      assert.equal(result.nutrients.energy.perServing, 389);
      assert.equal(result.nutrients.energy.per100, 2263);
      assert.equal(result.nutrients.sodium.per100, 72.7);
    },
  },
  {
    name: "retailer JSON wording",
    source: `<script>{"servesPerPack":"4","servingSizeDescription":"250 mL","ingredientsList":"Milk","allergenStatement":"Contains: Milk","nutritionInformation":[{"name":"Energy","perServe":"640 kJ","per100":"256 kJ"},{"name":"Protein","perServe":"8.5 g","per100":"3.4 g"}]}</script>`,
    verify(result: ReturnType<typeof parseAustralianNip>) {
      assert(result);
      assert.equal(result.servingsPerPackage, 4);
      assert.equal(result.servingQuantity, 250);
      assert.equal(result.servingUnit, "mL");
    },
  },
  {
    name: "alternative pack language",
    source: `Nutrition Information\nNumber of servings: 6.5\nPortion size: 40 g\nEnergy 300 kJ 750 kJ\nProtein 2 g 5 g`,
    verify(result: ReturnType<typeof parseAustralianNip>) {
      assert(result);
      assert.equal(result.servingsPerPackage, 6.5);
      assert.equal(result.servingQuantity, 40);
    },
  },
];

for (const fixture of fixtures) {
  const result = parseAustralianNip(fixture.source);
  fixture.verify(result);
  console.log(`✓ ${fixture.name}`);
}

console.log(`${fixtures.length} Australian NIP parser fixtures passed.`);
