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
  ["hf-roast-vegetable-frittata", "Roast Vegetable Frittata", "https://www.heartfoundation.org.au/recipes/roast-vegetable-frittata", ["Vegetarian", "Vegetables"]],
]);

const bhfBase = "https://www.bhf.org.uk/informationsupport/support/healthy-living/healthy-eating/recipe-finder";
const bhf = (slug: string) => `${bhfBase}/${slug}`;

const britishHeartFoundationRecipes = makeRecipes("British Heart Foundation", [
  ["bhf-vegetable-lasagne", "Mediterranean Vegetable Lasagne", bhf("mediterranean-vegetable-lasagne"), ["Vegetarian", "Vegetables"]],
  ["bhf-bean-chilli", "Vegetarian Bean Chilli", bhf("vegetarian-bean-chilli"), ["Legumes", "High fibre"]],
  ["bhf-wholewheat-nachos", "Wholewheat Nachos with Guacamole and Tomato Salsa", bhf("wholewheat-nachos-with-guacamole-and-tomato-salsa"), ["Wholegrain", "Vegetarian"]],
  ["bhf-banana-oat-cookies", "Banana Oat Cookies", bhf("banana-oat-cookies"), ["Oats", "Snack"]],
  ["bhf-black-bean-burritos", "Black Bean and Sweet Potato Burritos", bhf("black-bean-and-sweet-potato-burritos"), ["Legumes", "High fibre"]],
  ["bhf-garlicky-mushrooms-beans", "Garlicky Mushrooms with Baked Beans", bhf("garlicky-mushrooms-with-baked-beans"), ["Legumes", "Vegetarian"]],
  ["bhf-shakshuka", "Shakshuka", bhf("shakshuka"), ["Vegetarian", "Vegetables"]],
  ["bhf-trout-almond", "Trout Fillets with an Almond Crust", bhf("trout-fillets-with-an-almond-crust"), ["Fish", "Omega-3"]],
  ["bhf-red-pepper-pasta", "Roasted Tomato and Red Pepper Pasta", bhf("roasted-tomato-and-red-pepper-pasta"), ["Vegetarian", "Pasta"]],
  ["bhf-carrot-lentil-soup", "Red Pepper, Carrot and Lentil Soup", bhf("red-pepper-carrot-and-lentil-soup"), ["Legumes", "Soup"]],
  ["bhf-green-pesto-pasta", "Green Pesto Pasta", bhf("green-pesto-pasta"), ["Vegetarian", "Pasta"]],
  ["bhf-vegetable-frittata", "Mediterranean Vegetable Frittata", bhf("mediterranean-vegetable-frittata"), ["Vegetarian", "Vegetables"]],
  ["bhf-tuna-pasta", "Low-fat Creamy Tuna Pasta", bhf("low-fat-creamy-tuna-pasta"), ["Fish", "Pasta"]],
  ["bhf-lentil-stew", "Lentil Stew", bhf("lentil-stew"), ["Legumes", "High fibre"]],
  ["bhf-green-minestrone", "Green Minestrone Soup", bhf("green-minestrone-soup"), ["Legumes", "Soup"]],
  ["bhf-fish-tacos", "Fish Tacos", bhf("fish-tacos"), ["Fish", "Vegetables"]],
  ["bhf-squash-lentils", "Baked Butternut Squash with Lentils", bhf("baked-butternut-squash-with-lentils"), ["Legumes", "High fibre"]],
  ["bhf-cauliflower-curry", "Cauliflower, Pea and Potato Curry", bhf("cauliflower-pea-and-potato-curry"), ["Vegetarian", "Vegetables"]],
  ["bhf-avocado-egg-toast", "Avocado and Poached Egg on Toast", bhf("avocado-and-poached-egg-on-toast"), ["Unsaturated fat", "Breakfast"]],
  ["bhf-leek-mushroom-linguine", "Linguine with Leeks and Mushrooms", bhf("linguine-with-leeks-and-mushrooms"), ["Vegetarian", "Pasta"]],
  ["bhf-garlic-lemon-prawns", "Garlic and Lemon Prawns with Courgettes", bhf("garlic-and-lemon-prawns-with-courgettes"), ["Seafood", "Vegetables"]],
  ["bhf-beetroot-hummus", "Beetroot Hummus", bhf("beetroot-hummus"), ["Legumes", "Snack"]],
  ["bhf-carrot-coriander-soup", "Carrot and Coriander Soup", bhf("carrot-and-coriander-soup"), ["Vegetarian", "Soup"]],
  ["bhf-curried-lentil-soup", "Curried Lentil Soup with Yogurt Drizzle", bhf("curried-lentil-soup-with-yogurt-drizzle"), ["Legumes", "Soup"]],
  ["bhf-cabbage-bean-soup", "Tomato, Cabbage and Cannellini Bean Soup", bhf("tomato-cabbage-and-cannellini-beans-soup"), ["Legumes", "Soup"]],
  ["bhf-salmon-chickpea-traybake", "Indian-spiced Salmon and Chickpea Traybake", bhf("indian-spiced-salmon-and-chickpea-traybake"), ["Fish", "Legumes", "One pan"]],
  ["bhf-watermelon-bean-salad", "Watermelon, Butter Bean and Orange Salad", bhf("watermelon-butter-bean-and-orange-salad"), ["Legumes", "Salad"]],
  ["bhf-bulgur-broccoli-salad", "Bulgur Wheat Salad with Broccoli", bhf("bulgur-wheat-salad-with-broccoli"), ["Wholegrain", "Salad"]],
  ["bhf-quick-fish-stew", "Quick Fish Stew", bhf("quick-fish-stew"), ["Fish", "Quick"]],
  ["bhf-fishermans-pie", "Fisherman’s Pie", bhf("fishermans-pie"), ["Fish", "Vegetables"]],
  ["bhf-turkey-bean-bake", "Turkey, Leek and Bean Bake", bhf("turkey-leek-and-bean-bake"), ["Lean protein", "Legumes"]],
  ["bhf-fish-pie-cauliflower", "Fish Pie with Carrot and Cauliflower Mash", bhf("fish-pie-with-carrot-and-cauliflower-mash"), ["Fish", "Vegetables"]],
  ["bhf-mushroom-burgers", "Giant Garlic Mushroom Burgers", bhf("giant-garlic-mushroom-burgers"), ["Vegetarian", "Vegetables"]],
  ["bhf-vegetable-balti", "Vegetable Balti", bhf("vegetable-balti"), ["Vegetarian", "Vegetables"]],
  ["bhf-yam-pea-soup", "Yam and Gungo Pea Soup", bhf("yam-and-gungo-pigeon-pea-soup"), ["Legumes", "Soup"]],
  ["bhf-whole-urad-dhal", "Whole Urad Dhal", bhf("whole-urad-dhal"), ["Legumes", "High fibre"]],
  ["bhf-sardine-spaghetti", "Wholewheat Spaghetti with Sardines and Cherry Tomatoes", bhf("wholewheat-spaghetti-with-sardines-and-cherry-tomatoes"), ["Fish", "Omega-3", "Wholegrain"]],
  ["bhf-whole-mung-dhal", "Whole Mung Dhal", bhf("whole-mung-dhal"), ["Legumes", "High fibre"]],
  ["bhf-wholemeal-roti", "Wholemeal Chapati or Roti", bhf("wholemeal-chapati-or-roti"), ["Wholegrain", "Side"]],
  ["bhf-watercress-soup", "Watercress Soup", bhf("watercress-soup"), ["Vegetarian", "Soup"]],
  ["bhf-shepherds-pie", "Vegetarian Shepherd’s Pie with Polenta Topping", bhf("vegetarian-shepherds-pie-with-polenta-topping"), ["Legumes", "Vegetarian"]],
  ["bhf-sweet-potato-chilli", "Vegetarian Chilli with Sweet Potato", bhf("vegetarian-chilli-with-sweet-potato"), ["Legumes", "High fibre"]],
  ["bhf-tofu-noodles", "Vegetable Stir-fry with Tofu and Noodles", bhf("veggie-stir-fry"), ["Plant protein", "Vegetables"]],
  ["bhf-vegetable-biryani", "Vegetable Biryani", bhf("vegetable-biryani"), ["Vegetarian", "Wholegrain"]],
  ["bhf-vegan-jambalaya", "Vegan Jambalaya Rice Pot", bhf("vegan-jambalaya-rice-pot"), ["Legumes", "Vegan"]],
  ["bhf-tuscan-bean-stew", "Tuscan Bean and Vegetable Stew", bhf("tuscan-bean-and-vegetable-stew"), ["Legumes", "High fibre"]],
  ["bhf-tuna-fish-cakes", "Tuna Fish Cakes", bhf("tuna-fish-cakes"), ["Fish", "Quick"]],
  ["bhf-tuna-risotto", "Tuna and Courgette Risotto", bhf("tuna-and-courgette-risotto"), ["Fish", "Vegetables"]],
  ["bhf-trout-kedgeree", "Trout Kedgeree", bhf("trout-kedgeree"), ["Fish", "Omega-3"]],
  ["bhf-three-bean-pasta", "Three-bean Pasta Twist Salad", bhf("three-bean-pasta-twist-salad"), ["Legumes", "Salad"]],
  ["bhf-tandoori-salmon", "Tandoori Salmon Kebabs", bhf("tandoori-salmon-kebabs"), ["Fish", "Omega-3"]],
  ["bhf-sweet-potato-curry", "Sweet Potato Curry with Spinach and Chickpeas", bhf("sweet-potato-curry-with-spinach-and-chick-peas"), ["Legumes", "High fibre"]],
  ["bhf-salmon-tagliatelle", "Tagliatelle with Salmon and Courgettes", bhf("tagliatelle-with-salmon-and-courgettes"), ["Fish", "Pasta"]],
  ["bhf-quinoa-buddha-bowl", "Sweet Potato and Quinoa Buddha Bowl", bhf("sweet-potato-and-quinoa-buddha-bowl"), ["Wholegrain", "Vegetarian"]],
  ["bhf-summer-rolls", "Summer Rolls", bhf("summer-rolls-recipe"), ["Vegetables", "Light meal"]],
  ["bhf-tofu-pak-choi", "Stir-fried Tofu with Pak Choi", bhf("stir-fried-tofu-with-pak-choi"), ["Plant protein", "Vegetables"]],
  ["bhf-moong-dhal", "Moong Dhal", bhf("moong-dhal-mung-dal"), ["Legumes", "High fibre"]],
  ["bhf-squash-spinach-soup", "Spicy Squash and Spinach Soup", bhf("spicy-squash-and-spinach-soup"), ["Vegetarian", "Soup"]],
  ["bhf-spicy-lentil-soup", "Spicy Carrot and Lentil Soup", bhf("spicy-carrot-and-lentil-soup"), ["Legumes", "Soup"]],
  ["bhf-vegetable-couscous", "Spiced Vegetable Couscous", bhf("spiced-vegetable-couscous"), ["Wholegrain", "Vegetables"]],
  ["bhf-tofu-carrot-burgers", "Spiced Tofu and Carrot Burgers", bhf("spiced-tofu-and-carrot-burgers"), ["Plant protein", "Vegetables"]],
  ["bhf-vegetarian-fried-rice", "Vegetarian Stir-fried Rice", bhf("special-vegetarian-stir-fried-rice"), ["Vegetarian", "Vegetables"]],
  ["bhf-spanish-lentils-eggs", "Spanish-style Lentils with Eggs", bhf("spanish-style-lentils-with-eggs"), ["Legumes", "High fibre"]],
  ["bhf-smoky-cod-stew", "Smoky Cod Stew", bhf("smoky-cod-stew"), ["Fish", "Soup"]],
  ["bhf-prawn-fajitas", "Sizzling Prawn Fajitas", bhf("sizzling-prawn-fajitas"), ["Seafood", "Vegetables"]],
  ["bhf-seafood-paella", "Seafood Paella", bhf("seafood-paella"), ["Seafood", "Vegetables"]],
  ["bhf-seared-salmon", "Seared Salmon with Watercress Sauce", bhf("seared-salmon-with-watercress-sauce"), ["Fish", "Omega-3"]],
  ["bhf-salmon-beetroot", "Salmon with Honey-roast Beetroot Salad", bhf("salmon-with-honey-roast-beetroot-salad"), ["Fish", "Omega-3", "Salad"]],
  ["bhf-salmon-traybake", "Salmon Traybake", bhf("salmon-traybake"), ["Fish", "Omega-3", "One pan"]],
  ["bhf-chickpea-tagine", "Roast Vegetable and Chickpea Tagine", bhf("roast-vegetable-and-chickpea-tagine"), ["Legumes", "Vegetarian"]],
]);

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
