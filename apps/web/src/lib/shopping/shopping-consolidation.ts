import { prisma } from "@/lib/prisma";
import { normaliseProductText, parseProductName } from "@/lib/products/product-normalisation";

type ShoppingRecord = {
  id: string;
  shoppingListId: string;
  productId: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
};

function cleanCanonicalName(name: string) {
  const parsed = parseProductName(name);
  let canonical = parsed.canonicalName
    .replace(/\bwedges?\b/gi, "")
    .replace(/\bskinless\b/gi, "")
    .replace(/\bfillets?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bsalmon\b/i.test(canonical)) canonical = "salmon";
  if (/^lemons?$/i.test(canonical)) canonical = "lemon";

  return canonical;
}

function normalisedUnit(unit: string | null) {
  const value = normaliseProductText(unit ?? "item");
  if (["item", "items", "each", "ea"].includes(value)) return "each";
  if (["gram", "grams"].includes(value)) return "g";
  if (["kilogram", "kilograms"].includes(value)) return "kg";
  if (["millilitre", "millilitres"].includes(value)) return "ml";
  if (["litre", "litres"].includes(value)) return "l";
  return value;
}

function mergeKey(item: ShoppingRecord) {
  const identity = normaliseProductText(cleanCanonicalName(item.name));
  return `${item.checked ? "checked" : "open"}|${identity}|${normalisedUnit(item.unit)}`;
}

function splitCompoundName(item: ShoppingRecord) {
  const normalised = normaliseProductText(item.name);
  if (normalised.includes("mint leaves") && normalised.includes("lemon wedges")) {
    return ["Mint leaves", "Lemon"];
  }
  return null;
}

async function splitKnownCompoundItems(items: ShoppingRecord[]) {
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
  }
}

export async function consolidateShoppingItems() {
  const initialItems = await prisma.shoppingItem.findMany({
    select: {
      id: true,
      shoppingListId: true,
      productId: true,
      name: true,
      quantity: true,
      unit: true,
      checked: true,
    },
  });

  await splitKnownCompoundItems(initialItems);

  const items = await prisma.shoppingItem.findMany({
    select: {
      id: true,
      shoppingListId: true,
      productId: true,
      name: true,
      quantity: true,
      unit: true,
      checked: true,
    },
    orderBy: { id: "asc" },
  });

  const groups = new Map<string, ShoppingRecord[]>();
  for (const item of items) {
    const key = `${item.shoppingListId}|${mergeKey(item)}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const [keeper, ...duplicates] = group;
    const quantities = group.map((item) => item.quantity);
    const canSum = quantities.every((quantity) => quantity !== null);
    const quantity = canSum
      ? quantities.reduce<number>((total, value) => total + (value ?? 0), 0)
      : keeper.quantity;
    const canonicalName = cleanCanonicalName(keeper.name);
    const productId = group.find((item) => item.productId)?.productId ?? null;

    await prisma.$transaction([
      prisma.shoppingItem.update({
        where: { id: keeper.id },
        data: {
          name: canonicalName || keeper.name,
          quantity,
          unit: normalisedUnit(keeper.unit),
          productId,
        },
      }),
      prisma.shoppingItem.deleteMany({
        where: { id: { in: duplicates.map((item) => item.id) } },
      }),
    ]);
  }
}
