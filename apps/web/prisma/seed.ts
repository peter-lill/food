import "dotenv/config";
import { InventoryLocation, ProductType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const dayInMilliseconds = 24 * 60 * 60 * 1000;

function daysFromToday(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setTime(date.getTime() + days * dayInMilliseconds);
  return date;
}

const foodKnowledgeSeeds = [
  {
    commonName: "Banana",
    foodGroup: "Fruit",
    category: "Fresh produce",
    storageGuide: "Store at room temperature until ripe. Refrigerate ripe bananas to slow further ripening.",
  },
  {
    commonName: "Sweet Potato",
    scientificName: "Ipomoea batatas",
    foodGroup: "Vegetables",
    category: "Fresh produce",
    subCategory: "Root vegetables",
    storageGuide: "Keep in a cool, dark and ventilated place. Do not refrigerate raw sweet potatoes.",
  },
  {
    commonName: "Atlantic Salmon",
    scientificName: "Salmo salar",
    foodGroup: "Protein foods",
    category: "Seafood",
    storageGuide: "Keep chilled and use by the package date, or freeze promptly.",
  },
  {
    commonName: "Chicken Breast",
    foodGroup: "Protein foods",
    category: "Fresh meat",
    storageGuide: "Keep refrigerated below 5°C and use by the package date, or freeze promptly.",
  },
  {
    commonName: "Milk",
    foodGroup: "Dairy",
    category: "Chilled",
    storageGuide: "Keep refrigerated and return to the refrigerator promptly after use.",
  },
] as const;

const pantrySeedItems = [
  {
    name: "Chicken breast",
    quantity: 2.4,
    unit: "kg",
    location: InventoryLocation.FRIDGE,
    purchasedAt: daysFromToday(-1),
    expiresAt: daysFromToday(3),
    productType: ProductType.FRESH_MEAT,
  },
  {
    name: "Greek yoghurt",
    quantity: 1,
    unit: "tub",
    location: InventoryLocation.FRIDGE,
    purchasedAt: daysFromToday(-3),
    expiresAt: daysFromToday(1),
    productType: ProductType.DAIRY,
  },
  {
    name: "Salmon",
    quantity: 3,
    unit: "fillets",
    location: InventoryLocation.FREEZER,
    purchasedAt: daysFromToday(-5),
    expiresAt: daysFromToday(30),
    productType: ProductType.SEAFOOD,
  },
  {
    name: "Brown rice",
    quantity: 1.6,
    unit: "kg",
    location: InventoryLocation.PANTRY,
    purchasedAt: daysFromToday(-10),
    expiresAt: daysFromToday(180),
    productType: ProductType.PACKAGED,
  },
] as const;

type CobLoafIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

type CobLoafRecipe = {
  sourceKey: string;
  name: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fibreGrams: number;
  ingredients: CobLoafIngredient[];
  instructions: string[];
};

const cobLoafRecipes: CobLoafRecipe[] = [
  {
    sourceKey: "food-original-cob-loaf-spinach-cheese",
    name: "Spinach and Cheese Cob Loaf",
    description: "A warm cob loaf filled with spinach, cream cheese, yoghurt and melted cheese.",
    servings: 10,
    prepMinutes: 15,
    cookMinutes: 30,
    calories: 286,
    proteinGrams: 10.4,
    carbsGrams: 28.8,
    fatGrams: 14.6,
    fibreGrams: 2.4,
    ingredients: [
      { name: "Cob loaf", quantity: 1, unit: "loaf" },
      { name: "Frozen spinach", quantity: 250, unit: "g" },
      { name: "Light cream cheese", quantity: 250, unit: "g" },
      { name: "Greek yoghurt", quantity: 200, unit: "g" },
      { name: "Grated tasty cheese", quantity: 120, unit: "g" },
      { name: "French onion soup mix", quantity: 35, unit: "g" },
      { name: "Spring onion", quantity: 2, unit: "stalks" },
      { name: "Black pepper", quantity: 0.5, unit: "tsp" },
    ],
    instructions: [
      "Heat the oven to 180°C conventional or 160°C fan-forced.",
      "Slice the top from the cob loaf and pull out the soft bread, leaving a sturdy shell. Tear the removed bread into dipping pieces.",
      "Thaw the spinach and squeeze out as much moisture as possible.",
      "Mix the spinach, cream cheese, yoghurt, grated cheese, soup mix, spring onion and pepper until combined.",
      "Spoon the filling into the loaf and replace the lid. Wrap loosely in foil and bake for 20 minutes.",
      "Remove the foil, place the bread pieces around the loaf and bake for another 10 minutes until hot and golden.",
    ],
  },
  {
    sourceKey: "food-original-cob-loaf-chicken-corn",
    name: "Creamy Chicken and Corn Cob Loaf",
    description: "A family-style cob loaf with chicken, corn, herbs and a creamy yoghurt-based filling.",
    servings: 10,
    prepMinutes: 20,
    cookMinutes: 30,
    calories: 301,
    proteinGrams: 16.8,
    carbsGrams: 30.2,
    fatGrams: 11.9,
    fibreGrams: 2.3,
    ingredients: [
      { name: "Cob loaf", quantity: 1, unit: "loaf" },
      { name: "Cooked chicken breast", quantity: 300, unit: "g" },
      { name: "Corn kernels", quantity: 310, unit: "g" },
      { name: "Light cream cheese", quantity: 250, unit: "g" },
      { name: "Greek yoghurt", quantity: 180, unit: "g" },
      { name: "Grated tasty cheese", quantity: 100, unit: "g" },
      { name: "Garlic", quantity: 2, unit: "cloves" },
      { name: "Chives", quantity: 2, unit: "tbsp" },
      { name: "Smoked paprika", quantity: 1, unit: "tsp" },
    ],
    instructions: [
      "Heat the oven to 180°C conventional or 160°C fan-forced.",
      "Cut a lid from the loaf, remove the centre and tear the bread into pieces.",
      "Combine the chicken, drained corn, cream cheese, yoghurt, cheese, garlic, chives and paprika.",
      "Fill the loaf, replace the lid and bake on a lined tray for 20 minutes.",
      "Remove the lid, arrange the bread pieces on the tray and bake for another 10 minutes until the filling bubbles.",
    ],
  },
  {
    sourceKey: "food-original-cob-loaf-roasted-capsicum-feta",
    name: "Roasted Capsicum and Feta Cob Loaf",
    description: "A vegetarian cob loaf with roasted capsicum, feta, spinach and Mediterranean herbs.",
    servings: 10,
    prepMinutes: 15,
    cookMinutes: 30,
    calories: 274,
    proteinGrams: 10.1,
    carbsGrams: 29.4,
    fatGrams: 12.7,
    fibreGrams: 2.8,
    ingredients: [
      { name: "Cob loaf", quantity: 1, unit: "loaf" },
      { name: "Roasted red capsicum", quantity: 250, unit: "g" },
      { name: "Reduced-fat feta", quantity: 180, unit: "g" },
      { name: "Greek yoghurt", quantity: 250, unit: "g" },
      { name: "Baby spinach", quantity: 100, unit: "g" },
      { name: "Grated mozzarella", quantity: 100, unit: "g" },
      { name: "Garlic", quantity: 1, unit: "clove" },
      { name: "Dried oregano", quantity: 1, unit: "tsp" },
      { name: "Lemon zest", quantity: 1, unit: "tsp" },
    ],
    instructions: [
      "Heat the oven to 180°C conventional or 160°C fan-forced.",
      "Prepare the cob loaf shell and tear the removed bread into bite-sized pieces.",
      "Chop the capsicum and spinach, then mix with the feta, yoghurt, mozzarella, garlic, oregano and lemon zest.",
      "Spoon into the loaf, replace the lid and bake for 20 minutes.",
      "Add the bread pieces to the tray and bake uncovered for another 10 minutes until golden and heated through.",
    ],
  },
  {
    sourceKey: "food-original-cob-loaf-mushroom-thyme",
    name: "Mushroom and Thyme Cob Loaf",
    description: "A savoury cob loaf filled with mushrooms, thyme, garlic and melted cheese.",
    servings: 10,
    prepMinutes: 20,
    cookMinutes: 35,
    calories: 279,
    proteinGrams: 10.7,
    carbsGrams: 29.1,
    fatGrams: 13.1,
    fibreGrams: 2.5,
    ingredients: [
      { name: "Cob loaf", quantity: 1, unit: "loaf" },
      { name: "Button mushrooms", quantity: 400, unit: "g" },
      { name: "Olive oil", quantity: 1, unit: "tbsp" },
      { name: "Light cream cheese", quantity: 250, unit: "g" },
      { name: "Greek yoghurt", quantity: 180, unit: "g" },
      { name: "Grated tasty cheese", quantity: 100, unit: "g" },
      { name: "Garlic", quantity: 2, unit: "cloves" },
      { name: "Fresh thyme", quantity: 1, unit: "tbsp" },
      { name: "Black pepper", quantity: 0.5, unit: "tsp" },
    ],
    instructions: [
      "Heat the oven to 180°C conventional or 160°C fan-forced.",
      "Prepare the loaf shell and bread pieces.",
      "Finely slice the mushrooms and cook in the olive oil over medium-high heat until their liquid has evaporated. Add garlic and thyme for the final minute.",
      "Cool slightly, then mix with cream cheese, yoghurt, grated cheese and pepper.",
      "Fill the loaf and bake covered for 20 minutes, then uncovered with the bread pieces for 10 to 15 minutes.",
    ],
  },
  {
    sourceKey: "food-original-cob-loaf-sweet-chilli-prawn",
    name: "Sweet Chilli Prawn Cob Loaf",
    description: "A seafood cob loaf with prawns, sweet chilli, lime and a creamy cheese filling.",
    servings: 10,
    prepMinutes: 20,
    cookMinutes: 30,
    calories: 295,
    proteinGrams: 16.2,
    carbsGrams: 31.4,
    fatGrams: 11.5,
    fibreGrams: 1.9,
    ingredients: [
      { name: "Cob loaf", quantity: 1, unit: "loaf" },
      { name: "Cooked peeled prawns", quantity: 300, unit: "g" },
      { name: "Light cream cheese", quantity: 250, unit: "g" },
      { name: "Greek yoghurt", quantity: 180, unit: "g" },
      { name: "Grated mozzarella", quantity: 100, unit: "g" },
      { name: "Sweet chilli sauce", quantity: 3, unit: "tbsp" },
      { name: "Spring onion", quantity: 2, unit: "stalks" },
      { name: "Lime juice", quantity: 1, unit: "tbsp" },
      { name: "Coriander", quantity: 2, unit: "tbsp" },
    ],
    instructions: [
      "Heat the oven to 180°C conventional or 160°C fan-forced.",
      "Prepare the cob loaf shell and reserve the bread pieces.",
      "Roughly chop the prawns and combine with cream cheese, yoghurt, mozzarella, sweet chilli sauce, spring onion, lime juice and coriander.",
      "Spoon into the loaf, replace the lid and bake for 20 minutes.",
      "Remove the lid, add the bread pieces to the tray and bake for another 10 minutes until piping hot.",
    ],
  },
];

async function seedFoodKnowledge() {
  for (const knowledge of foodKnowledgeSeeds) {
    await prisma.foodKnowledge.upsert({
      where: { commonName: knowledge.commonName },
      create: knowledge,
      update: knowledge,
    });
  }
  console.log(`Food knowledge seeded with ${foodKnowledgeSeeds.length} entries.`);
}

async function seedPantry() {
  const existingItems = await prisma.inventoryItem.count();
  if (existingItems > 0) {
    console.log(`Pantry seed skipped: ${existingItems} existing item(s) found.`);
    return;
  }

  for (const item of pantrySeedItems) {
    const product = await prisma.product.create({
      data: {
        name: item.name,
        canonicalName: item.name,
        productType: item.productType,
      },
    });

    await prisma.inventoryItem.create({
      data: {
        productId: product.id,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location,
        purchasedAt: item.purchasedAt,
        expiresAt: item.expiresAt,
      },
    });
  }

  console.log(`Pantry seeded with ${pantrySeedItems.length} items.`);
}

async function seedCobLoafRecipes() {
  for (const recipeSeed of cobLoafRecipes) {
    const recipe = await prisma.recipe.upsert({
      where: { sourceKey: recipeSeed.sourceKey },
      create: {
        sourceKey: recipeSeed.sourceKey,
        sourceName: "Food original",
        name: recipeSeed.name,
        description: recipeSeed.description,
        instructions: recipeSeed.instructions.join("\n"),
        servings: recipeSeed.servings,
        prepMinutes: recipeSeed.prepMinutes,
        cookMinutes: recipeSeed.cookMinutes,
        calories: recipeSeed.calories,
        proteinGrams: recipeSeed.proteinGrams,
        carbsGrams: recipeSeed.carbsGrams,
        fatGrams: recipeSeed.fatGrams,
        fibreGrams: recipeSeed.fibreGrams,
      },
      update: {
        sourceName: "Food original",
        name: recipeSeed.name,
        description: recipeSeed.description,
        instructions: recipeSeed.instructions.join("\n"),
        servings: recipeSeed.servings,
        prepMinutes: recipeSeed.prepMinutes,
        cookMinutes: recipeSeed.cookMinutes,
        calories: recipeSeed.calories,
        proteinGrams: recipeSeed.proteinGrams,
        carbsGrams: recipeSeed.carbsGrams,
        fatGrams: recipeSeed.fatGrams,
        fibreGrams: recipeSeed.fibreGrams,
      },
      select: { id: true },
    });

    await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });

    for (const item of recipeSeed.ingredients) {
      const ingredient = await prisma.ingredient.upsert({
        where: { name: item.name },
        create: { name: item.name },
        update: {},
        select: { id: true },
      });

      await prisma.recipeIngredient.create({
        data: {
          recipeId: recipe.id,
          ingredientId: ingredient.id,
          quantity: item.quantity,
          unit: item.unit,
        },
      });
    }
  }

  console.log(`Cob loaf recipes seeded with ${cobLoafRecipes.length} entries.`);
}

async function main() {
  await seedFoodKnowledge();
  await seedPantry();
  await seedCobLoafRecipes();
}

main()
  .catch((error) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });