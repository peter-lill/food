export type ExternalRecipe = {
  id: string;
  name: string;
  description: string;
  sourceName: "RecipeTin Eats" | "Heart Foundation";
  sourceUrl: string;
  sourceHomeUrl: string;
  imageUrl: string | null;
  minutes: number | null;
  servings: number | null;
  licence: string;
  tags: string[];
};

export const externalRecipes: ExternalRecipe[] = [
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
  ...[
    ["hf-overnight-oats", "Grab and Go Overnight Oats", "Oats, chia, berries and almonds for a fibre-rich breakfast.", "https://www.heartfoundation.org.au/recipes/overnight-oats", 10, 1, ["Oats", "High fibre", "Breakfast"]],
    ["hf-lentil-pilaf", "Lentil Pilaf", "Lentils, mushrooms, cauliflower and rice in a warmly spiced pilaf.", "https://www.heartfoundation.org.au/recipes/lentil-pilaf", null, null, ["Legumes", "Vegetarian"]],
    ["hf-salmon-quinoa", "Baked Salmon with Quinoa Salad", "Spiced salmon with quinoa, broad beans and a yoghurt tahini dressing.", "https://www.heartfoundation.org.au/recipes/baked-salmon-with-quinoa-salad", 55, 4, ["Fish", "Omega-3", "Wholegrain"]],
    ["hf-bean-chilli", "One Pot Veggie and Bean Chilli", "A batch-friendly vegetable and bean chilli.", "https://www.heartfoundation.org.au/recipes/one-pot-veggie-and-bean-chilli", null, null, ["High fibre", "Legumes", "Batch cooking"]],
    ["hf-salmon-poke", "Salmon Poke Bowl", "Salmon, brown rice, edamame and colourful vegetables.", "https://www.heartfoundation.org.au/recipes/salmon-poke-bowl", null, 4, ["Fish", "Omega-3", "Wholegrain"]],
    ["hf-baked-beans", "Homemade Baked Beans", "Cannellini beans, tomatoes and spinach served on multigrain toast.", "https://www.heartfoundation.org.au/recipes/homemade-baked-beans", null, null, ["High fibre", "Legumes", "Breakfast"]],
    ["hf-lentil-soup", "Lentil and Vegetable Soup", "Sweet potato, lentils, tomatoes and spinach with grainy bread.", "https://www.heartfoundation.org.au/recipes/lentil-and-vegetable-soup-with-crusty-bread", null, 4, ["High fibre", "Legumes", "Soup"]],
    ["hf-sweet-potato-beans", "Baked Sweet Potato with Cannellini Beans", "Baked sweet potato topped with a spiced bean and vegetable stew.", "https://www.heartfoundation.org.au/recipes/baked-sweet-potato-and-cannellini-beans", 85, 4, ["High fibre", "Legumes", "Vegetarian"]],
    ["hf-bircher", "Bircher Muesli with Tropical Fruit", "Rolled oats, apple, pear, yoghurt, almonds and tropical fruit.", "https://www.heartfoundation.org.au/recipes/bircher-muesli", null, null, ["Oats", "High fibre", "Breakfast"]],
    ["hf-greek-salmon", "One Pan Greek Salmon Bake", "Salmon roasted with eggplant, zucchini, capsicum and herbs.", "https://www.heartfoundation.org.au/recipes/one-pan-greek-salmon-bake", null, null, ["Fish", "Omega-3", "One pan"]],
    ["hf-green-minestrone", "Green Spring Minestrone", "A vegetable-rich soup with cannellini beans, peas and broad beans.", "https://www.heartfoundation.org.au/recipes/green-spring-minestrone", null, null, ["High fibre", "Legumes", "Soup"]],
    ["hf-blueberry-oats", "Blueberry Cheesecake Oats", "Hot oats with blueberries, banana, ricotta and pepitas.", "https://www.heartfoundation.org.au/recipes/blueberry-cheesecake-oats", 15, 2, ["Oats", "Breakfast"]],
    ["hf-salmon-shakshuka", "Salmon Shakshuka", "Salmon and eggs in a tomato, capsicum and red-lentil base.", "https://www.heartfoundation.org.au/recipes/salmon-shakshuka", null, null, ["Fish", "Legumes", "Omega-3"]],
  ].map(([id, name, description, sourceUrl, minutes, servings, tags]) => ({
    id: id as string,
    name: name as string,
    description: description as string,
    sourceName: "Heart Foundation" as const,
    sourceUrl: sourceUrl as string,
    sourceHomeUrl: "https://www.heartfoundation.org.au/",
    imageUrl: null,
    minutes: minutes as number | null,
    servings: servings as number | null,
    licence: "CC BY-NC-ND 4.0 — National Heart Foundation of Australia.",
    tags: tags as string[],
  })),
];
