import { prisma } from "@/lib/prisma";
import { getProductCatalogue } from "@/lib/products/product-catalogue.repository";
import {
  formatMeasurement,
  formatProductName,
  formatProductQuantity,
} from "@/lib/products/product-formatter";
import { parseProductName } from "@/lib/products/product-normalisation";
import { consolidateShoppingItems } from "./shopping-consolidation";
import type { ShoppingWorkspaceData } from "./shopping.types";

const categoryKeywords: Array<[string, string[]]> = [
  [
    "Pantry & other",
    [
      "vinegar", "stock cube", "stock cubes", "stock powder", "stock concentrate",
      "liquid stock", "vegetable stock", "chicken stock", "beef stock", "bone broth",
      "broth", "bouillon", "seasoning", "spice", "sauce", "oil", "dressing",
      "gravy", "paste", "powder", "cube",
    ],
  ],
  [
    "Fruit & vegetables",
    [
      "apple", "avocado", "banana", "basil", "beans", "berry", "berries",
      "broccoli", "capsicum", "carrot", "coriander", "corn", "cucumber",
      "garlic", "herb", "lemon", "lettuce", "lime", "mint", "mushroom",
      "onion", "parsley", "peas", "potato", "salad", "spinach", "tomato",
      "vegetable",
    ],
  ],
  ["Meat & seafood", ["beef", "chicken", "fish", "lamb", "mince", "pork", "salmon", "steak", "tuna", "turkey", "prawn"]],
  ["Dairy & eggs", ["butter", "cheese", "cream", "egg", "milk", "yoghurt", "yogurt", "cottage cheese"]],
  ["Bakery & grains", ["bread", "wrap", "rice", "oats", "pasta", "flour", "cereal", "tortilla"]],
  ["Frozen", ["frozen", "ice cream"]],
  ["Drinks", ["coffee", "juice", "soft drink", "tea", "water"]],
  ["Household", ["cleaner", "dishwasher", "foil", "laundry", "paper towel", "soap", "tissue", "toilet paper", "bag"]],
];

const departmentToShoppingCategory: Record<string, string> = {
  "Fruit & vegetables": "Fruit & vegetables",
  Bakery: "Bakery & grains",
  "Meat & seafood": "Meat & seafood",
  "Dairy & eggs": "Dairy & eggs",
  Frozen: "Frozen",
  Drinks: "Drinks",
  Household: "Household",
  Pantry: "Pantry & other",
  International: "Pantry & other",
  Confectionery: "Pantry & other",
  "Health & personal care": "Pantry & other",
  Baby: "Pantry & other",
  Pet: "Pantry & other",
  Other: "Pantry & other",
};

export function getShoppingCategory(name: string, department?: string | null) {
  if (department && departmentToShoppingCategory[department]) {
    return departmentToShoppingCategory[department];
  }
  const normalised = name.toLocaleLowerCase("en-AU");
  return categoryKeywords.find(([, keywords]) => keywords.some((keyword) => normalised.includes(keyword)))?.[0] ?? "Pantry & other";
}

function shoppingItemDisplay(item: {
  name: string;
  quantity: number | null;
  unit: string | null;
}) {
  const parsed = parseProductName(item.name);
  const details: string[] = [];
  const quantity = formatProductQuantity(item.quantity, item.unit);

  if (quantity) details.push(quantity);
  else if (parsed.quantity !== null) {
    const parsedQuantity = formatProductQuantity(parsed.quantity, parsed.unit);
    if (parsedQuantity) details.push(parsedQuantity);
  }

  if (parsed.packQuantity !== null && parsed.packUnit) {
    details.push(formatMeasurement(parsed.packQuantity, parsed.packUnit));
  }

  if (parsed.variants.length) {
    details.push(parsed.variants.map(formatProductName).join(", "));
  }

  return {
    displayName: formatProductName(item.name),
    detail: details.length ? details.join(" · ") : null,
  };
}

export async function getShoppingListOptions() {
  return prisma.shoppingList.findMany({
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getShoppingWorkspace(): Promise<ShoppingWorkspaceData> {
  await consolidateShoppingItems();

  const [lists, pantryItems, products] = await Promise.all([
    prisma.shoppingList.findMany({
      include: {
        items: {
          include: {
            product: {
              select: { name: true, canonicalName: true, category: true },
            },
          },
          orderBy: [{ checked: "asc" }, { name: "asc" }],
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.inventoryItem.findMany({
      where: { quantity: { lte: 2 } },
      include: { product: true },
      orderBy: [{ quantity: "asc" }, { product: { name: "asc" } }],
      take: 12,
    }),
    getProductCatalogue(),
  ]);

  return {
    lists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
      totalCount: list.items.length,
      completedCount: list.items.filter((item) => item.checked).length,
      items: list.items.map((item) => {
        const display = shoppingItemDisplay(item);
        return {
          id: item.id,
          name: item.name,
          displayName: display.displayName,
          detail: display.detail,
          quantity: item.quantity,
          unit: item.unit,
          checked: item.checked,
          category: getShoppingCategory(display.displayName, item.product?.category),
        };
      }),
    })),
    pantrySuggestions: pantryItems.map((item) => ({
      id: item.id,
      name: formatProductName(item.product.canonicalName ?? item.product.name),
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
    })),
    products,
  };
}
