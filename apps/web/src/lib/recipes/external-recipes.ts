import bhfCatalogue from "@/generated/bhf-recipes.json";

export type ExternalRecipeNutrition = {
  energyKj: number | null;
  calories: number | null;
  carbsGrams: number | null;
  fibreGrams: number | null;
  fatGrams: number | null;
  saturatedFatGrams: number | null;
  sugarGrams: number | null;
  saltGrams: number | null;
};

export type ExternalRecipe = {
  id: string;
  name: string;
  description: string;
  sourceName:
    | "RecipeTin Eats"
    | "Heart Foundation"
    | "Australian Heart Foundation"
    | "British Heart Foundation"
    | "Mayo Clinic";
  sourceUrl: string;
  sourceHomeUrl: string;
  imageUrl: string | null;
  minutes: number | null;
  servings: number | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  nutrition?: ExternalRecipeNutrition | null;
  licence: string;
  tags: string[];
};

type RecipeSeed = readonly [
  id: string,
  name: string,
  sourceUrl: string,
  tags: readonly string[],
  description?: string,
];

const sourceDetails = {
  "Heart Foundation": {
    home: "https://www.heartfoundation.org.au/",
    licence: "CC BY-NC-ND 4.0 — National Heart Foundation of Australia.",
  },
  "British Heart Foundation": {
    home: "https://www.bhf.org.uk/",
    licence: "Recipe link and title used with attribution to the British Heart Foundation.",
  },
  "Mayo Clinic": {
    home: "https://www.mayoclinic.org/",
    licence: "Recipe link and title used with attribution to Mayo Clinic.",
  },
} as const;

function makeRecipes(
  sourceName: keyof typeof sourceDetails,
  seeds: readonly RecipeSeed[],
): ExternalRecipe[] {
  const source = sourceDetails[sourceName];

  return seeds.map(([id, name, sourceUrl, tags, description]) => ({
    id,
    name,
    description:
      description ??
      `A heart-conscious ${tags.slice(0, 2).join(" and ").toLowerCase()} recipe from ${sourceName}.`,
    sourceName,
    sourceUrl,
    sourceHomeUrl: source.home,
    imageUrl: null,
    minutes: null,
    servings: null,
    licence: source.licence,
    tags: [...tags],
  }));
}

const recipeTinRecipes: ExternalRecipe[] = [
  {
    id: "rte-lentil-soup",
    name: "Lentil Soup",
    description: "A nourishing lentil soup finished with lemon.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/lentil-soup/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: 55,
    servings: 6,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["High fibre", "Legumes", "Vegetarian"],
  },
  {
    id: "rte-lentil-eggplant-salad",
    name: "Lentil and Roasted Eggplant Salad",
    description: "Roasted eggplant and lentils with a bright lemon dressing.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/lentil-roasted-eggplant-salad/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: "https://www.recipetineats.com/tachyon/2020/07/Roasted-Eggplant-Lentil-Salad_5.jpg",
    minutes: null,
    servings: null,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["High fibre", "Legumes", "Vegetarian"],
  },
  {
    id: "rte-lemon-garlic-salmon",
    name: "Lemon Garlic Salmon Tray Bake",
    description: "Salmon, asparagus and tomatoes cooked together on one tray.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/lemon-garlic-salmon-tray-bake-easy-healthy/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: "https://www.recipetineats.com/tachyon/2024/02/Lemon-garlic-salmon-tray-bake_1.jpg",
    minutes: 21,
    servings: 4,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Fish", "Omega-3", "One pan"],
  },
  {
    id: "rte-cauliflower-soup",
    name: "Creamy Cauliflower Soup",
    description: "A thick vegetable soup made creamy without relying on cream.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/creamy-dreamy-cauliflower-soup/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: 25,
    servings: 4,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Vegetarian", "Soup"],
  },
  {
    id: "rte-brown-rice-salad",
    name: "Mediterranean Brown Rice Salad",
    description: "A fresh, filling brown-rice salad with herbs and lemon.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/brown-rice-salad/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: "https://www.recipetineats.com/tachyon/2020/09/Brown-Rice-Salad_8.jpg",
    minutes: 55,
    servings: 8,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Wholegrain", "Vegetarian"],
  },
];

const heartFoundationRecipes = makeRecipes("Heart Foundation", [
  ["hf-overnight-oats", "Grab and Go Overnight Oats", "https://www.heartfoundation.org.au/recipes/overnight-oats", ["Oats", "High fibre", "Breakfast"]],
  ["hf-lentil-pilaf", "Lentil Pilaf", "https://www.heartfoundation.org.au/recipes/lentil-pilaf", ["Legumes", "Vegetarian"]],
  ["hf-salmon-quinoa", "Baked Salmon with Quinoa Salad", "https://www.heartfoundation.org.au/recipes/baked-salmon-with-quinoa-salad", ["Fish", "Omega-3", "Wholegrain"]],
  ["hf-bean-chilli", "One Pot Veggie and Bean Chilli", "https://www.heartfoundation.org.au/recipes/one-pot-veggie-and-bean-chilli", ["High fibre", "Legumes", "Batch cooking"]],
  ["hf-salmon-poke", "Salmon Poke Bowl", "https://www.heartfoundation.org.au/recipes/salmon-poke-bowl", ["Fish", "Omega-3", "Wholegrain"]],
  ["hf-baked-beans", "Homemade Baked Beans", "https://www.heartfoundation.org.au/recipes/homemade-baked-beans", ["High fibre", "Legumes", "Breakfast"]],
  ["hf-lentil-soup", "Lentil and Vegetable Soup", "https://www.heartfoundation.org.au/recipes/lentil-and-vegetable-soup-with-crusty-bread", ["High fibre", "Legumes", "Soup"]],
  ["hf-sweet-potato-beans", "Baked Sweet Potato with Cannellini Beans", "https://www.heartfoundation.org.au/recipes/baked-sweet-potato-and-cannellini-beans", ["High fibre", "Legumes", "Vegetarian"]],
  ["hf-bircher", "Bircher Muesli with Tropical Fruit", "https://www.heartfoundation.org.au/recipes/bircher-muesli", ["Oats", "High fibre", "Breakfast"]],
  ["hf-greek-salmon", "One Pan Greek Salmon Bake", "https://www.heartfoundation.org.au/recipes/one-pan-greek-salmon-bake", ["Fish", "Omega-3", "One pan"]],
  ["hf-green-minestrone", "Green Spring Minestrone", "https://www.heartfoundation.org.au/recipes/green-spring-minestrone", ["High fibre", "Legumes", "Soup"]],
  ["hf-blueberry-oats", "Blueberry Cheesecake Oats", "https://www.heartfoundation.org.au/recipes/blueberry-cheesecake-oats", ["Oats", "Breakfast"]],
  ["hf-salmon-shakshuka", "Salmon Shakshuka", "https://www.heartfoundation.org.au/recipes/salmon-shakshuka", ["Fish", "Legumes", "Omega-3"]],
  ["hf-sticky-salmon-rice", "Sticky Baked Salmon with Brown Fried Rice", "https://www.heartfoundation.org.au/recipes/sticky-baked-salmon-served-with-brown-fried-rice", ["Fish", "Omega-3", "Wholegrain"]],
  ["hf-chicken-bean-corn", "Chicken, Black Bean and Corn Salad", "https://www.heartfoundation.org.au/recipes/chicken-black-bean-and-corn-salad", ["Lean protein", "Legumes", "Salad"]],
  ["hf-speedy-salmon", "Speedy Salmon Stir-fry", "https://www.heartfoundation.org.au/recipes/speedy-salmon-stirfry", ["Fish", "Omega-3", "Quick"]],
  ["hf-lentil-curry", "Lentil and Vegetable Curry", "https://www.heartfoundation.org.au/recipes/lentil-and-vegetable-curry", ["Legumes", "High fibre", "Vegetarian"]],
  ["hf-sweet-potato-lentil-soup", "Asian-spiced Sweet Potato and Lentil Soup", "https://www.heartfoundation.org.au/recipes/step-by-step/asian-spiced-sweet-potato-and-lentil-for-two", ["Legumes", "Soup", "High fibre"]],
  ["hf-chai-oats", "Chai Overnight Oats", "https://www.heartfoundation.org.au/recipes/step-by-step/chai-overnight-oats", ["Oats", "High fibre", "Breakfast"]],
  ["hf-beans-pizzaiola", "One Pan Beans Pizzaiola", "https://www.heartfoundation.org.au/recipes/step-by-step/one-pan-beans-pizzaiola", ["Legumes", "One pan", "Vegetarian"]],
  ["hf-turkey-kofta", "Turkey and Lentil Kofta", "https://www.heartfoundation.org.au/recipes/turkey-and-lentil-kofta", ["Lean protein", "Legumes"]],
  ["hf-salmon-primavera", "Salmon Primavera Spaghetti", "https://www.heartfoundation.org.au/recipes/salmon-primavera-spaghetti", ["Fish", "Omega-3", "Pasta"]],
  ["hf-lentil-beetroot-salad", "Lentil, Carrot and Beetroot Salad", "https://www.heartfoundation.org.au/recipes/lentil-carrot-beetroot-salad", ["Legumes", "Salad", "High fibre"]],
  ["hf-bean-burrito", "Vegetarian Bean Burrito", "https://www.heartfoundation.org.au/recipes/vegetarian-bean-burrito", ["Legumes", "High fibre", "Vegetarian"]],
  ["hf-salmon-asparagus", "Salmon with Asparagus Gremolata", "https://www.heartfoundation.org.au/recipes/salmon-with-asparagus-gremolata", ["Fish", "Omega-3"]],
  ["hf-apple-oats", "Apple, Honey and Nut Crumble Oats", "https://www.heartfoundation.org.au/recipes/apple-honey-nut-crumble-oats", ["Oats", "High fibre", "Breakfast"]],
  ["hf-apple-oat-cookies", "Apple Oat Cookies", "https://www.heartfoundation.org.au/recipes/apple-oat-cookies", ["Oats", "Snack"]],
  ["hf-margherita-spaghetti", "Oven-baked Margherita Spaghetti", "https://www.heartfoundation.org.au/recipes/oven-baked-margherita-spaghetti-2", ["Vegetarian", "Pasta"]],
  ["hf-small-mighty-oats", "Small but Mighty Overnight Oats", "https://www.heartfoundation.org.au/recipes/small-mighty-overnight-oats", ["Oats", "High fibre", "Breakfast"]],
  ["hf-hot-oats", "Hot Oats", "https://www.heartfoundation.org.au/recipes/hot-oats", ["Oats", "High fibre", "Breakfast"]],
  ["hf-pumpkin-bean-joes", "Mexican Pumpkin and Bean Sloppy Joes", "https://www.heartfoundation.org.au/recipes/mexican-pumpkin-and-bean-sloppy-joes", ["Legumes", "High fibre", "Vegetarian"]],
  ["hf-mushroom-lentil-risotto", "Mixed Mushroom and Lentil Risotto", "https://www.heartfoundation.org.au/recipes/mixed-mushroom-and-lentil-risotto", ["Legumes", "Vegetarian"]],
  ["hf-beef-lentil-bolognese", "Beef and Lentil Bolognese", "https://www.heartfoundation.org.au/recipes/beef-and-lentil-bolognese", ["Lean protein", "Legumes", "High fibre"]],
  ["hf-six-ingredient-salmon", "Six Ingredient Salmon", "https://www.heartfoundation.org.au/recipes/six-ingredient-salmon", ["Fish", "Omega-3", "Quick"]],
  ["hf-green-goodness-frittata", "Green Goodness Frittata", "https://www.heartfoundation.org.au/recipes/step-by-step/green-goodness-frittata", ["Vegetarian", "Vegetables"]],
]);

const britishHeartFoundationRecipes: ExternalRecipe[] =
  bhfCatalogue.recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    sourceName: "British Heart Foundation",
    sourceUrl: recipe.sourceUrl,
    sourceHomeUrl: recipe.sourceHomeUrl,
    imageUrl: recipe.imageUrl,
    minutes: recipe.minutes,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    nutrition: recipe.nutrition,
    licence: recipe.licence,
    tags: recipe.tags,
  }));

const mayoRecipes = makeRecipes("Mayo Clinic", [
  ["mayo-white-bean-dip", "Artichoke, Spinach and White Bean Dip", "https://www.mayoclinic.org/healthy-lifestyle/recipes/artichoke-spinach-and-white-bean-dip/rcp-20146111", ["Legumes", "Vegetarian", "Snack"]],
  ["mayo-black-bean-burger", "Black Bean Burgers", "https://www.mayoclinic.org/healthy-lifestyle/recipes/black-bean-burgers/rcp-20049667", ["Legumes", "Vegetarian"]],
  ["mayo-lentil-soup", "Lentil Soup", "https://www.mayoclinic.org/healthy-lifestyle/recipes/lentil-soup/rcp-20049749", ["Legumes", "High fibre", "Soup"]],
  ["mayo-roasted-salmon", "Roasted Salmon with Maple Glaze", "https://www.mayoclinic.org/healthy-lifestyle/recipes/roasted-salmon-with-maple-glaze/rcp-20049685", ["Fish", "Omega-3"]],
  ["mayo-overnight-oats", "Overnight Oatmeal", "https://www.mayoclinic.org/healthy-lifestyle/recipes/overnight-oatmeal/rcp-20049775", ["Oats", "Breakfast", "High fibre"]],
  ["mayo-brown-rice", "Brown Rice Pilaf", "https://www.mayoclinic.org/healthy-lifestyle/recipes/brown-rice-pilaf/rcp-20049731", ["Wholegrain", "Vegetarian"]],
]);

export const externalRecipes: ExternalRecipe[] = [
  ...recipeTinRecipes,
  ...heartFoundationRecipes,
  ...britishHeartFoundationRecipes,
  ...mayoRecipes,
];
