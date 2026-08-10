import { prisma } from "@/lib/prisma";
import {
  canonicalGroceryIdentity,
  canonicalGroceryName,
  resolveCanonicalProduct,
} from "@/lib/products/canonical-grocery.service";
import {
  foodItemShape,
  normaliseGroceryUnit,
} from "@/lib/products/food-item-intelligence";
import { formatProductName } from "@/lib/products/product-formatter";
import { normaliseProductText } from "@/lib/products/product-normalisation";
import { parseRecipeIngredientLine } from "@/lib/recipes/recipe-pantry";
import { optimiseShoppingFulfilment } from "./shopping-optimisation";

type ShoppingRecord = {
  id: string;
  shoppingListId: string;
  productId: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  product: {
    name: string;
    canonicalName: string | null;
  } | null;
};

function sourceName(item: ShoppingRecord) {
  return item.name.trim() || item.product?.canonicalName || item.product?.name || "Unknown Item";
}

function canonicalIdentity(item: ShoppingRecord) {
  return canonicalGroceryIdentity(sourceName(item));
}

function mergeUnit(item: ShoppingRecord) {
  const shape = foodItemShape(sourceName(item));
  const unit = normaliseGroceryUnit(item.unit);

  if (shape === "COUNT_VARIABLE" && ["each", "item"].includes(unit)) return "each";
  return unit;
}

function mergeKey(item: ShoppingRecord) {
  return `${item.shoppingListId}|${canonicalIdentity(item)}|${mergeUnit(item)}`;
}

function splitCompoundName(item: ShoppingRecord) {
  const normalised = normaliseProductText(item.name);
  if (normalised.includes("mint leaves") && normalised.includes("lemon wedges")) {
    return ["Mint Leaves", "Lemon"];
  }
  return null;
}

async function cleanRecipeShoppingNoise(items: ShoppingRecord[]) {
  let changed = false;

  for (const item of items) {
    const parsedName = parseRecipeIngredientLine(item.name).name;
    if (!parsedName) {
      await prisma.shoppingItem.delete({ where: { id: item.id } });
      changed = true;
      continue;
    }

    if (!/\bor\b/i.test(item.name) || normaliseProductText(parsedName) === normaliseProductText(item.name)) continue;
    await prisma.shoppingItem.update({
      where: { id: item.id },
      data: { name: parsedName, productId: null },
    });
    changed = true;
  }

  return changed;
}

async function splitKnownCompoundItems(items: ShoppingRecord[]) {
  let changed = false;

  for (const item of items) {
    const parts = splitCompoundName(item);
    if (!parts) continue;

    await prisma.$transaction([
      prisma.shoppingItem.update({
        where: { id: item.id },
        data: { name: parts[0], productId: null },
      }),
      prisma.shoppingItem.create({
        data: {
          shoppingListId: item.shoppingListId,
          name: parts[1],
          quantity: item.quantity,
          unit: item.unit,
          checked: item.checked,
        },
      }),
    ]);
    changed = true;
  }

  return changed;
}

async function applyShoppingOptimisation(items: ShoppingRecord[]) {
  const updates = optimiseShoppingFulfilment(items);
  if (!updates.length) return false;

  await prisma.$transaction(
    updates.map((update) => prisma.shoppingItem.update({
      where: { id: update.id },
      data: {
        name: canonicalGroceryName(update.name),
        quantity: update.quantity,
        unit: update.unit,
        productId: null,
      },
    })),
  );

  return true;
}

async function readShoppingItems(): Promise<ShoppingRecord[]> {
  return prisma.shoppingItem.findMany({
    select: {
      id: true,
      shoppingListId: true,
      productId: true,
      name: true,
      quantity: true,
      unit: true,
      checked: true,
      product: {
        select: {
          name: true,
          canonicalName: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

async function mergeDuplicateItems(items: ShoppingRecord[]) {
  const groups = new Map<string, ShoppingRecord[]>();

  for (const item of items) {
    const key = mergeKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  let changed = false;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const [keeper, ...duplicates] = group;
    const quantities = group.map((item) => item.quantity);
    const canSum = quantities.every((quantity) => quantity !== null);
    const quantity = canSum
      ? quantities.reduce<number>((total, value) => total + (value ?? 0), 0)
      : keeper.quantity;
    const canonicalProduct = await resolveCanonicalProduct(sourceName(keeper));
    const checked = group.every((item) => item.checked);

    await prisma.$transaction([
      prisma.shoppingItem.update({
        where: { id: keeper.id },
        data: {
          name: canonicalProduct.canonicalName ?? canonicalProduct.name,
          quantity,
          unit: mergeUnit(keeper),
          productId: canonicalProduct.id,
          checked,
        },
      }),
      prisma.shoppingItem.deleteMany({
        where: { id: { in: duplicates.map((item) => item.id) } },
      }),
    ]);

    changed = true;
  }

  return changed;
}

async function normaliseSingleItems(items: ShoppingRecord[]) {
  let changed = false;

  for (const item of items) {
    const canonicalProduct = await resolveCanonicalProduct(sourceName(item));
    const displayName = formatProductName(canonicalProduct.canonicalName ?? canonicalProduct.name);
    const unit = mergeUnit(item);
    if (item.name === displayName && item.unit === unit && item.productId === canonicalProduct.id) continue;

    await prisma.shoppingItem.update({
      where: { id: item.id },
      data: {
        name: displayName,
        unit,
        productId: canonicalProduct.id,
      },
    });
    changed = true;
  }

  return changed;
}

export async function consolidateShoppingItems() {
  for (let pass = 0; pass < 5; pass += 1) {
    const beforeCleanup = await readShoppingItems();
    const cleanupChanged = await cleanRecipeShoppingNoise(beforeCleanup);
    const beforeSplit = cleanupChanged ? await readShoppingItems() : beforeCleanup;
    const splitChanged = await splitKnownCompoundItems(beforeSplit);
    const afterSplit = splitChanged ? await readShoppingItems() : beforeSplit;
    const optimisationChanged = await applyShoppingOptimisation(afterSplit);
    const afterOptimisation = optimisationChanged ? await readShoppingItems() : afterSplit;
    const mergeChanged = await mergeDuplicateItems(afterOptimisation);
    const afterMerge = mergeChanged ? await readShoppingItems() : afterOptimisation;
    const normaliseChanged = await normaliseSingleItems(afterMerge);

    if (!cleanupChanged && !splitChanged && !optimisationChanged && !mergeChanged && !normaliseChanged) break;
  }
}
