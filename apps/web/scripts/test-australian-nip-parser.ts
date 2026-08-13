import assert from "node:assert/strict";
import { parseAustralianNip, plausibleIngredients } from "../src/lib/product-intelligence/australian-nip-parser";
import { colesProductLabelSource, colesProductLabelSourceFromData } from "../src/lib/product-intelligence/coles-label-page";
import { validatedRetailerLabelText } from "../src/lib/product-intelligence/openai-retailer-response";

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

const colesNextData = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { product: {
    additionalInfo: [
      { title: "Ingredients", description: "Ingredients Sugar, Milk Solids, Cocoa Butter, Wheat Flour, Emulsifier (Soy Lecithin)." },
      { title: "Allergen", description: "Contains Gluten, Milk, Soy, Wheat<br/>May Contain Hazelnut" },
    ],
    nutrition: {
      servingsPerPackage: "9.00",
      servingSize: "17.2g",
      breakdown: [
        { title: "Per Serving", nutrients: [{ nutrient: "Energy", value: "380 kJ" }, { nutrient: "Protein", value: "1.1 g" }] },
        { title: "Per 100g/ml", nutrients: [{ nutrient: "Energy", value: "2220 kJ" }, { nutrient: "Protein", value: "6.5 g" }] },
      ],
    },
  } } },
})}</script>`;
const colesLabelSource = colesProductLabelSource(colesNextData);
assert(colesLabelSource);
const colesLabel = parseAustralianNip(colesLabelSource);
assert(colesLabel);
assert.equal(colesLabel.servingsPerPackage, 9);
assert.equal(colesLabel.servingQuantity, 17.2);
assert.equal(colesLabel.nutrients.energy.per100, 2220);
assert.match(colesLabel.ingredientsText ?? "", /Sugar, Milk Solids/);
assert.deepEqual(colesLabel.contains, ["Gluten", "Milk", "Soy", "Wheat"]);
assert.deepEqual(colesLabel.mayContain, ["Hazelnut"]);

const colesApiLabelSource = colesProductLabelSourceFromData({ result: { raw: { product: {
  additionalInfo: [
    { title: "Ingredients", description: "Wheat Flour, Dried Potatoes, Vegetable Oil, Kalamata Olives, Fetta Cheese (From Milk)." },
    { title: "Allergen", description: "Contains Gluten, Milk, Wheat; May Contain Egg, Peanut, Sesame, Soy" },
  ],
  nutrition: {
    servingSize: "20g",
    servingsPerPackage: "6.5",
    breakdown: [
      { title: "Per Serving", nutrients: [{ nutrient: "Energy", value: "384 kJ" }, { nutrient: "Protein", value: "1.8 g" }] },
      { title: "Per 100g/ml", nutrients: [{ nutrient: "Energy", value: "1920 kJ" }, { nutrient: "Protein", value: "9.1 g" }] },
    ],
  },
} } } });
assert(colesApiLabelSource);
const colesApiLabel = parseAustralianNip(colesApiLabelSource);
assert(colesApiLabel);
assert.equal(colesApiLabel.servingQuantity, 20);
assert.equal(colesApiLabel.nutrients.energy.per100, 1920);
assert.match(colesApiLabel.ingredientsText ?? "", /Kalamata Olives/);

const sourcedFallback = validatedRetailerLabelText({ output: [
  { type: "web_search_call", action: { sources: [{ url: "https://www.coles.com.au/product/arnotts-flatbread-dippers-feta-and-olive-130g-5481620" }] } },
  { type: "message", content: [{ type: "output_text", text: "Nutrition Information\nServing size: 20g\nEnergy: 384 kJ 1920 kJ\nIngredients: Wheat Flour, Dried Potatoes, Vegetable Oil." }] },
] }, "https://www.coles.com.au/product/arnotts-flatbread-dippers-feta-and-olive-130g-5481620");
assert.match(sourcedFallback ?? "", /1920 kJ/);
assert.equal(validatedRetailerLabelText({ output: [{ type: "message", content: [{ type: "output_text", text: sourcedFallback ?? "" }] }] }, "https://www.coles.com.au/product/arnotts-flatbread-dippers-feta-and-olive-130g-5481620"), null, "unsourced model output must be rejected");
const woolworthsFallback = validatedRetailerLabelText({ output: [
  { type: "web_search_call", action: { sources: [{ url: "https://www.woolworths.com.au/shop/productdetails/6055275" }] } },
  { type: "message", content: [{ type: "output_text", text: "Nutrition Information\nServing size: 25g\nEnergy: 400 kJ 1600 kJ\nIngredients: Wheat Flour, Olive Oil." }] },
] }, "https://www.woolworths.com.au/shop/productdetails/6055275?utm_source=test");
assert.match(woolworthsFallback ?? "", /1600 kJ/, "an exact Woolworths product citation must support label fallback enrichment");

for (const fixture of fixtures) {
  const result = parseAustralianNip(fixture.source);
  fixture.verify(result);
  console.log(`✓ ${fixture.name}`);
}

assert.equal(
  plausibleIngredients("Sugar, milk solids, wheat flour, cocoa butter, vegetable oil, emulsifier (soy lecithin), salt."),
  "Sugar, milk solids, wheat flour, cocoa butter, vegetable oil, emulsifier (soy lecithin), salt.",
);
assert.equal(plausibleIngredients("Save $2.50 per 100g, new low price"), null);

console.log(`${fixtures.length} Australian NIP parser fixtures passed.`);
