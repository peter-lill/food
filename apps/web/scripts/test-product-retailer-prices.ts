import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { bestProductImage, departmentFromLegacyWoolworthsPath, displayShelfLabel, finaliseProductFamilyListItem, latestPricesByRetailer, preferMoreSpecificShelfLabel, productFamilyName, type ProductHubListItem } from "../src/lib/products/product-hub.repository";
import { heroProductDescription } from "../src/lib/products/product-description";
import { priceObservationKind } from "../src/lib/products/price-observation-display";

const productPageSource = readFileSync(new URL("../src/app/products/[productId]/page.tsx", import.meta.url), "utf8");
const productCatalogueSource = readFileSync(new URL("../src/app/products/page.tsx", import.meta.url), "utf8");
const productHubStyles = readFileSync(new URL("../src/app/products/products-hub.module.css", import.meta.url), "utf8");
const departmentArtworkStyles = readFileSync(new URL("../src/app/products/department-artwork.module.css", import.meta.url), "utf8");
const productHubSource = readFileSync(new URL("../src/lib/products/product-hub.repository.ts", import.meta.url), "utf8");

assert.doesNotMatch(
  productPageSource,
  /Â|Ã|â€|â†/,
  "the product page must not contain mojibake artefacts",
);
assert.match(productHubSource, /category: product\.category \?\? sourceDepartment/, "a family must start from its canonical category, not an incidental retailer aisle");
assert.match(productHubSource, /current\.category = product\.category \?\? departmentFromLegacyWoolworthsPath\(woolworthsAisle\) \?\? current\.category/, "every family variant must be able to replace an older incidental category with its canonical category");

assert.equal(
  bestProductImage(null, [], true),
  "stored://product-image",
  "a stored primary asset must keep a catalogue image visible when the legacy image URL is missing",
);
assert.equal(priceObservationKind("coles-pilot"), "Catalogue price", "internal Coles importer names must not reach customer-facing price history");
assert.equal(priceObservationKind("woolworths-controlled-import"), "Catalogue price", "internal Woolworths importer names must not reach customer-facing price history");
assert.equal(priceObservationKind("receipt:Coles"), "Receipt purchase", "receipt-backed history must have a customer-facing label");
assert.equal(
  displayShelfLabel("/shop/browse/freezer/frozen-meals"),
  "Frozen Meals",
  "legacy Woolworths browse paths must render as a human shelf label",
);
assert.equal(
  preferMoreSpecificShelfLabel("Deli", "Deli Meat", "Deli"),
  "Deli Meat",
  "a family must replace an intermediate Deli shelf with the meaningful Deli Meat leaf",
);
assert.equal(
  productFamilyName("D'Orsogna Premium Ham The Bone Shaved From The Deli Per 100g"),
  "Dorsogna Premium Ham The Bone Shaved From The Deli",
  "removing a deli weight must not leave a dangling Per in the displayed family name",
);
assert.equal(
  productFamilyName("Cabbage Whole"),
  "Cabbage",
  "a whole cabbage must group with its portioned equivalent",
);
assert.equal(
  productFamilyName("Cabbage Half"),
  "Cabbage",
  "a half cabbage must remain a variant of the cabbage family",
);
assert.equal(
  productFamilyName("Red Cabbage Whole"),
  "Red Cabbage",
  "whole and half qualifiers must not collapse distinct cabbage varieties",
);
assert.equal(
  productFamilyName("Caesar Salad Bowl"),
  "Caesar Salad",
  "a prepared salad bowl must group with its packaged salad family",
);
assert.equal(
  productFamilyName("Caesar Salad Kit Entertainer"),
  "Caesar Salad",
  "prepared-salad package formats must remain variants of the same salad",
);
assert.equal(
  productFamilyName("Capsicum Yellow Each"),
  "Capsicum Yellow Each",
  "different capsicum varieties must remain separate product families",
);
assert.equal(
  departmentFromLegacyWoolworthsPath("/shop/browse/pantry/cooking-sauces/stock"),
  "Pantry",
  "a legacy Woolworths Pantry path must override a historical meat name match",
);
assert.equal(
  departmentFromLegacyWoolworthsPath("/shop/browse/freezer/frozen-meals"),
  "Frozen",
  "a legacy Woolworths freezer path must not appear in Pantry",
);
assert.equal(
  heroProductDescription("Origin: MADE IN AUSTRALIA. Ingredients: Sugar, milk powder."),
  "Origin: MADE IN AUSTRALIA.",
  "raw ingredient statements must not appear in the product hero description",
);

const observedAt = new Date("2026-08-09T00:00:00.000Z");
const prices = latestPricesByRetailer([
  { retailer: "Woolworths", price: 7.5, isSpecial: false, observedAt, storeProduct: { packSize: "160g" } },
  { retailer: "Coles", price: 3.75, isSpecial: true, observedAt: new Date("2026-08-09T00:01:00.000Z"), storeProduct: { packSize: "160g" } },
  { retailer: "Coles", price: 7.5, isSpecial: false, observedAt: new Date("2026-08-08T00:00:00.000Z"), storeProduct: { packSize: "160g" } },
]);

assert.deepEqual(prices.map(({ retailer, price, isSpecial }) => ({ retailer, price, isSpecial })), [
  { retailer: "Coles", price: 3.75, isSpecial: true },
  { retailer: "Woolworths", price: 7.5, isSpecial: false },
]);

const activiaFamily: ProductHubListItem = {
  id: "activia-mixed-berries",
  name: "Activia Probiotic Yoghurt No Added Sugar Mixed Berries 4 Pack",
  canonicalName: "Yoghurt",
  slug: "activia-probiotic-yoghurt",
  brand: "Activia",
  description: "Support your gut health with Activia Probiotic Yoghurt No Added Sugar.",
  category: "Dairy & eggs",
  shelfLabel: "Yoghurt",
  productType: "DAIRY",
  imageUrl: "https://cdn.example/activia.jpg",
  barcode: "9300000000000",
  aliasCount: 29,
  recipeCount: 0,
  pantryQuantity: 0,
  retailerCount: 29,
  variantCount: 1,
  latestPrice: 7,
  latestRetailer: "Woolworths",
  latestPackSize: "4 pack",
  latestObservedAt: observedAt,
  latestIsSpecial: false,
  priceNeedsSpecificVariant: false,
};
const yoghurtFamily = finaliseProductFamilyListItem(activiaFamily, 29, 1);
assert.equal(yoghurtFamily.description, null, "a family card must not inherit one variant's marketing description");
assert.equal(yoghurtFamily.imageUrl, "https://cdn.example/activia.jpg", "a family card may retain one representative image without adopting its variant details");
assert.equal(yoghurtFamily.category, "Dairy & eggs", "a family card must retain its shared department");
assert.equal(yoghurtFamily.retailerCount, 1, "retailer counts must be distinct across grouped variants");
assert.equal(yoghurtFamily.variantCount, 29, "a family card must report the number of specific products it contains");
assert.equal(yoghurtFamily.priceNeedsSpecificVariant, true, "family pricing must direct people to a specific variant");

assert.match(productPageSource, /familyView \? null : await getOrGenerateProductContent/, "family pages must not generate or display content for an arbitrary variant");
assert.match(productPageSource, /!familyView \? <ProductImagePanel/, "family pages must not expose one variant's image tools as family content");
assert.match(productCatalogueSource, /const productImage = product\.imageUrl/, "family cards must render their retained representative catalogue image");
assert.match(productPageSource, /listing\.productUrl \? <a className=\{styles\.retailerPriceLink\}/, "retailer prices must link to their authoritative product page when available");
assert.match(productPageSource, /price\.sourceUrl \?\? product\.storeProducts\.find/, "price comparison tiles must prefer each observation's authoritative retailer URL");
assert.match(productPageSource, /<RetailerLogo compact retailer=\{listing\.retailer\} \/>/, "retailer price links must keep their retailer logo visible");
assert.match(productPageSource, /priceObservationKind\(observation\.source\)/, "recent price history must translate internal ingestion identifiers before rendering");
assert.doesNotMatch(productPageSource, /<small>\{observation\.source\}/, "recent price history must never render internal ingestion identifiers");
assert.match(productHubSource, /getProductDepartmentCounts/, "the default catalogue must build a complete department index instead of relying on its first page of products");
assert.match(productHubSource, /getProductHubRecordCount/, "the catalogue header must have an unpaged product-record count separate from its family view");
assert.match(productCatalogueSource, /productRecordCount\.toLocaleString\("en-AU"\)/, "the catalogue header must display the actual product-record count");
assert.match(productCatalogueSource, /families in this view/, "the catalogue must distinguish the current collapsed-family result from the product-record count");
assert.match(productHubSource, /take: department \? 2_000 : 500/, "a selected department must be browsable beyond the alphabetical default page");
assert.match(productCatalogueSource, /shelfGroupForDepartment\(product\.shelfLabel, department\)/, "department browsing must suppress a duplicate department name as a shelf heading");
assert.match(productCatalogueSource, /open=\{Boolean\(department\)\}/, "opening a selected department must reveal its shelf choices without a redundant second click");
assert.match(productCatalogueSource, /const showProductCardsDirectly = Boolean\(q \|\| department \|\| view !== "all"\)/, "searches, department pages and filters must show product cards without nesting them behind category accordions");
assert.match(productCatalogueSource, /showProductCardsDirectly \? <div className=\{`\$\{departmentStyles\.fullWidth\} \$\{styles\.grid\}`\}/, "direct catalogue contexts render the product grid immediately at full catalogue width");
assert.match(departmentArtworkStyles, /\.fullWidth\s*\{\s*grid-column:\s*1\s*\/\s*-1;/, "direct product grids must span every department column instead of being compressed into one");
assert.match(productHubStyles, /\.cardBody h2\{[^}]*height:2\.5em[^}]*-webkit-line-clamp:2/, "desktop card titles must use a fixed two-line band");
assert.match(productHubStyles, /@media\(min-width:1451px\)\{\.grid\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/, "wide catalogue pages must show six compact product cards across");
assert.match(productHubStyles, /\.cardBody \.identitySlot\{height:2\.3rem[^}]*overflow:hidden/, "desktop card brands must use a compact fixed-height band");
assert.match(productHubStyles, /\.identitySlot \.brandLine\{[^}]*-webkit-line-clamp:2/, "long card brands must be clamped instead of moving price rows");
assert.match(productHubStyles, /\.grid\{align-items:start\}/, "desktop product cards must not stretch to the tallest card in their row");
assert.match(productHubStyles, /\.card\{grid-template-rows:132px auto\}/, "desktop product cards must use a compact image band");
assert.match(productCatalogueSource, /className=\{styles\.priceSummary\}/, "product cards must present one prominent best-price summary");
assert.match(productCatalogueSource, /className=\{styles\.cardFooter\}/, "product cards must retain retailer and checked details in a compact footer");
assert.match(productHubStyles, /\.priceSummary strong\{[^}]*font-size:1\.38rem/, "product card prices must remain visually prominent in the dense catalogue layout");

console.log("Product retailer price display regressions passed.");
