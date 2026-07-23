import { prisma } from "@/lib/prisma";
import type { ShoppingWorkspaceData } from "./shopping.types";

const categoryKeywords: Array<[string, string[]]> = [
  ["Fruit & vegetables", ["apple", "banana", "berry", "berries", "broccoli", "carrot", "corn", "cucumber", "garlic", "lettuce", "mushroom", "onion", "peas", "potato", "salad", "spinach", "tomato", "vegetable", "avocado", "capsicum", "beans"]],
  ["Meat & seafood", ["beef", "chicken", "fish", "lamb", "mince", "pork", "salmon", "steak", "tuna", "turkey", "prawn"]],
  ["Dairy & eggs", ["butter", "cheese", "cream", "egg", "milk", "yoghurt", "yogurt", "cottage cheese"]],
  ["Bakery & grains", ["bread", "wrap", "rice", "oats", "pasta", "flour", "cereal", "tortilla"]],
  ["Frozen", ["frozen", "ice cream"]],
  ["Drinks", ["coffee", "juice", "soft drink", "tea", "water"]],
  ["Household", ["cleaner", "dishwasher", "foil", "laundry", "paper towel", "soap", "tissue", "toilet paper", "bag"]],
];

export function getShoppingCategory(name: string) {
  const normalised = name.toLocaleLowerCase("en-AU");
  return categoryKeywords.find(([, keywords]) => keywords.some((keyword) => normalised.includes(keyword)))?.[0] ?? "Pantry & other";
}

export async function getShoppingWorkspace(): Promise<ShoppingWorkspaceData> {
  const [lists, pantryItems] = await Promise.all([
    prisma.shoppingList.findMany({
      include: {
        items: {
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
  ]);

  return {
    lists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
      totalCount: list.items.length,
      completedCount: list.items.filter((item) => item.checked).length,
      items: list.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        checked: item.checked,
        category: getShoppingCategory(item.name),
      })),
    })),
    pantrySuggestions: pantryItems.map((item) => ({
      id: item.id,
      name: item.product.name,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
    })),
  };
}
