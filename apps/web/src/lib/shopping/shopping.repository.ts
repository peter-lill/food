import { prisma } from "@/lib/prisma";
import { getProductCatalogue } from "@/lib/products/product-catalogue.repository";
import { parseProductName } from "@/lib/products/product-normalisation";
import { consolidateShoppingItems } from "./shopping-consolidation";
import type { ShoppingWorkspaceData } from "./shopping.types";

const categoryKeywords: Array<[string, string[]]> = [
  [
    "Fruit & vegetables",
    [
      "apple",
      "avocado",
      "banana",
      "basil",
      "beans",
      "berry",
      "berries",
      "broccoli",
      "capsicum",
      "carrot",
      "coriander",
      "corn",
      "cucumber",
      "garlic",
      "herb",
      "lemon",
      "lettuce",
      "lime",
      "mint",
      "mushroom",
      "onion",
      "parsley",
      "peas",
      "potato",
      "salad",
      "spinach",
      "tomato",
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

export function getShoppingCategory(name: string) {
  const normalised = name.toLocaleLowerCase("en-AU");
  return categoryKeywords.find(([, keywords]) => keywords.some((keyword) => normalised.includes(keyword)))?.[0] ?? "Pantry & other";
}

function sentenceCase(value: string) {
  return value ? value.charAt(0).toLocaleUpperCase("en-AU") + value.slice(1) : value;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function shoppingItemDisplay(item: {
  name: string;
  quantity: number | null;
  unit: string | null;
  product: { name: string; canonicalName: string | null } | null;
}) {
  const parsed = parseProductName(item.name);
  const displayName = sentenceCase(
    item.product?.canonicalName ?? item.product?.name ?? parsed.canonicalName,
  );
  const details: string[] = [];

  if (item.quantity !== null) {
    details.push(`${formatNumber(item.quantity)} ${item.unit?.trim() || "item"}`);
  } else if (parsed.quantity !== null) {
    details.push(`${formatNumber(parsed.quantity)} ${parsed.unit ?? "item"}`);
  }

  if (parsed.packQuantity !== null && parsed.packUnit) {
    details.push(`${formatNumber(parsed.packQuantity)} ${parsed.packUnit}`);
  }

  if (parsed.variants.length) {
    details.push(parsed.variants.map(sentenceCase).join(", "));
  }

  return {
    displayName,
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
              select: { name: true, canonicalName: true },
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
          category: getShoppingCategory(display.displayName),
        };
      }),
    })),
    pantrySuggestions: pantryItems.map((item) => ({
      id: item.id,
      name: item.product.name,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
    })),
    products,
  };
}
