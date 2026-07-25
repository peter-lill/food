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
    imageUrl: null,
    minutes: recipe.minutes,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    nutrition: recipe.nutrition,
    licence: recipe.licence,
    tags: recipe.tags,
  }));

const mayoRecipes = makeRecipes("Mayo Clinic", [
  ["mayo-white-bean-dip", "Artichoke, Spinach and White Bean Dip", "https://www.mayoclinic.org/healthy-lifestyle/recipes/artichoke-spinach-white-bean-dip/rcp-20152939", ["Legumes", "Vegetables"]],
  ["mayo-corn-relish", "Black Bean and Corn Relish", "https://www.mayoclinic.org/healthy-lifestyle/recipes/black-bean-and-corn-relish/rcp-20049744", ["Legumes", "High fibre"]],
  ["mayo-portobellos", "Ginger-marinated Grilled Portobello Mushrooms", "https://www.mayoclinic.org/healthy-lifestyle/recipes/ginger-marinated-grilled-portobello-mushrooms/rcp-20049663", ["Vegetarian", "Vegetables"]],
  ["mayo-hummus", "Hummus", "https://www.mayoclinic.org/healthy-lifestyle/recipes/hummus/rcp-20049675", ["Legumes", "Snack"]],
  ["mayo-peanut-hummus", "Peanut Butter Hummus", "https://www.mayoclinic.org/healthy-lifestyle/recipes/peanut-butter-hummus/rcp-20197732", ["Legumes", "Unsaturated fat"]],
  ["mayo-quinoa-cakes", "Quinoa Cakes", "https://www.mayoclinic.org/healthy-lifestyle/recipes/quinoa-cakes/rcp-20197739", ["Wholegrain", "Vegetarian"]],
  ["mayo-pepper-hummus", "Roasted Red Pepper Hummus", "https://www.mayoclinic.org/healthy-lifestyle/recipes/roasted-red-pepper-hummus/rcp-20197743", ["Legumes", "Vegetables"]],
  ["mayo-bean-dip", "White Bean Dip", "https://www.mayoclinic.org/healthy-lifestyle/recipes/white-bean-dip/rcp-20049728", ["Legumes", "Snack"]],
  ["mayo-banana-pancakes", "Banana Oatmeal Pancakes", "https://www.mayoclinic.org/healthy-lifestyle/recipes/banana-oatmeal-pancakes/rcp-20197673", ["Oats", "Breakfast"]],
  ["mayo-buckwheat-pancakes", "Buckwheat Pancakes", "https://www.mayoclinic.org/healthy-lifestyle/recipes/buckwheat-pancakes/rcp-20049839", ["Wholegrain", "Breakfast"]],
  ["mayo-muesli-bars", "Muesli Breakfast Bars", "https://www.mayoclinic.org/healthy-lifestyle/recipes/muesli-breakfast-bars/rcp-20049614", ["Oats", "Breakfast"]],
  ["mayo-banana-bread", "Whole-grain Banana Bread", "https://www.mayoclinic.org/healthy-lifestyle/recipes/wholegrain-banana-bread/rcp-20049955", ["Wholegrain", "Breakfast"]],
  ["mayo-hot-cereal", "Six-grain Hot Cereal", "https://www.mayoclinic.org/healthy-lifestyle/recipes/6-grain-hot-cereal/rcp-20197750", ["Wholegrain", "High fibre"]],
  ["mayo-cod-capers", "Baked Cod with Lemon and Capers", "https://www.mayoclinic.org/healthy-lifestyle/recipes/cod-with-lemon-and-capers/rcp-20049653", ["Fish", "Lean protein"]],
  ["mayo-baked-oatmeal", "Baked Oatmeal", "https://www.mayoclinic.org/healthy-lifestyle/recipes/baked-oatmeal/rcp-20049931", ["Oats", "High fibre"]],
  ["mayo-asian-salmon", "Baked Salmon with Southeast Asian Marinade", "https://www.mayoclinic.org/healthy-lifestyle/recipes/baked-salmon-with-southeast-asian-marinade/rcp-20049736", ["Fish", "Omega-3"]],
  ["mayo-bean-salad", "Bean Salad with Balsamic Vinaigrette", "https://www.mayoclinic.org/healthy-lifestyle/recipes/bean-salad-with-balsamic-vinaigrette/rcp-20049640", ["Legumes", "Salad"]],
  ["mayo-broccoli-rigatoni", "Broccoli, Garlic and Rigatoni", "https://www.mayoclinic.org/healthy-lifestyle/recipes/broccoli-garlic-and-rigatoni/rcp-20049646", ["Vegetables", "Pasta"]],
  ["mayo-fish-veracruz", "Fish Veracruz", "https://www.mayoclinic.org/healthy-lifestyle/recipes/fish-veracruz/rcp-20125128", ["Fish", "Vegetables"]],
  ["mayo-puttanesca-rice", "Fresh Puttanesca with Brown Rice", "https://www.mayoclinic.org/healthy-lifestyle/recipes/fresh-puttanesca-with-brown-rice/rcp-20135111", ["Wholegrain", "Vegetables"]],
  ["mayo-cod-citrus", "Grilled Cod with Crispy Citrus Salad", "https://www.mayoclinic.org/healthy-lifestyle/recipes/grilled-cod-with-crispy-citrus-salad/rcp-20049981", ["Fish", "Salad"]],
  ["mayo-herb-cod", "Herb-crusted Baked Cod", "https://www.mayoclinic.org/healthy-lifestyle/recipes/herb-crusted-baked-cod/rcp-20049672", ["Fish", "Lean protein"]],
  ["mayo-mediterranean-fish", "Mediterranean Fish Fillets", "https://www.mayoclinic.org/healthy-lifestyle/recipes/mediterranean-fish-fillets/rcp-20125107", ["Fish", "Vegetables"]],
  ["mayo-spinach-garbanzo-pasta", "Pasta with Spinach, Garbanzos and Raisins", "https://www.mayoclinic.org/healthy-lifestyle/recipes/pasta-with-spinach-garbanzos-and-raisins/rcp-20049797", ["Legumes", "Vegetables"]],
  ["mayo-tuna-bean-salad", "Quick Bean and Tuna Salad", "https://www.mayoclinic.org/healthy-lifestyle/recipes/quick-bean-and-tuna-salad/rcp-20049996", ["Fish", "Legumes", "Quick"]],
  ["mayo-rice-beans", "Rice and Beans Salad", "https://www.mayoclinic.org/healthy-lifestyle/recipes/rice-and-beans-salad/rcp-20049942", ["Legumes", "Wholegrain"]],
  ["mayo-roasted-salmon", "Roasted Salmon", "https://www.mayoclinic.org/healthy-lifestyle/recipes/roasted-salmon/rcp-20049927", ["Fish", "Omega-3"]],
  ["mayo-pear-fennel-salad", "Salad Greens with Pears, Fennel and Walnuts", "https://www.mayoclinic.org/healthy-lifestyle/recipes/salad-greens-with-pears-fennel-and-walnuts/rcp-20049707", ["Salad", "Unsaturated fat"]],
  ["mayo-sesame-tofu", "Sesame-crusted Tofu", "https://www.mayoclinic.org/healthy-lifestyle/recipes/sesamecrusted-tofu/rcp-20049620", ["Plant protein", "Vegetarian"]],
  ["mayo-vegan-bowl", "Southwestern Vegan Bowl", "https://www.mayoclinic.org/healthy-lifestyle/recipes/southwestern-vegan-bowl/rcp-20152941", ["Legumes", "Vegan"]],
  ["mayo-stuffed-eggplant", "Stuffed Eggplant", "https://www.mayoclinic.org/healthy-lifestyle/recipes/stuffed-eggplant/rcp-20049718", ["Vegetarian", "Vegetables"]],
  ["mayo-lentil-stew", "Vegetable, Lentil and Garbanzo Bean Stew", "https://www.mayoclinic.org/healthy-lifestyle/recipes/vegetable-lentil-garbanzo-bean-stew/rcp-20157577", ["Legumes", "High fibre"]],
  ["mayo-mushroom-barley", "Mushroom Barley Soup", "https://www.mayoclinic.org/healthy-lifestyle/recipes/mushroom-barley-soup/rcp-20197728", ["Wholegrain", "Soup"]],
  ["mayo-gazpacho", "Gazpacho with Chickpeas", "https://www.mayoclinic.org/healthy-lifestyle/recipes/gazpacho-with-garbanzo-beans/rcp-20049662", ["Legumes", "Soup"]],
  ["mayo-french-lentil-salad", "French Green Lentil Salad", "https://www.mayoclinic.org/healthy-lifestyle/recipes/french-green-lentil-salad/rcp-20049902", ["Legumes", "Salad"]],
  ["mayo-mixed-bean-salad", "Mixed Bean Salad", "https://www.mayoclinic.org/healthy-lifestyle/recipes/mixed-bean-salad/rcp-20049682", ["Legumes", "High fibre"]],
  ["mayo-minestrone", "Minestrone Soup", "https://www.mayoclinic.org/healthy-lifestyle/recipes/minestrone-soup/rcp-20049680", ["Legumes", "Soup"]],
  ["mayo-lentil-ragout", "Lentil Ragout", "https://www.mayoclinic.org/healthy-lifestyle/recipes/lentil-ragout/rcp-20197726", ["Legumes", "High fibre"]],
  ["mayo-quinoa-salad", "Quinoa Salad", "https://www.mayoclinic.org/healthy-lifestyle/recipes/quinoa-salad/rcp-20125126", ["Wholegrain", "Salad"]],
  ["mayo-broccoli-lemon", "Broccoli with Garlic and Lemon", "https://www.mayoclinic.org/healthy-lifestyle/recipes/broccoli-with-garlic-and-lemon/rcp-20197681", ["Vegetables", "Side"]],
]);

export const externalRecipes: ExternalRecipe[] = [
  ...recipeTinRecipes,
  ...heartFoundationRecipes,
  ...britishHeartFoundationRecipes,
  ...mayoRecipes,
];
