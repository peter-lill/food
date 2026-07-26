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
  product: {
    name: string;
    canonicalName: string | null;
  } | null;
};

function cleanCanonicalName(name: string) {
  const parsed = parseProductName(name);
  let canonical = parsed.canonicalName
    .replace(/\bwedges?\b/gi, "")
    .replace(/\bskinless\b/gi, "")
    .replace(/\bfillets?\b/gi, "")
    .replace(/\bleaves\s*$/i, " leaves")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bsalmon\b/i.test(canonical)) canonical = "salmon";
  if (/^lemons?$/i.test(canonical)) canonical = "lemon";

  return canonical;
}

function canonicalIdentity(item: ShoppingRecord) {
  const linkedName = item.product?.canonicalName ?? item.product?.name;
  const canonical = cleanCanonicalName(linkedName || item.name);
  return normaliseProductText(canonical);
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
  return `${item.shoppingListId}|${canonicalIdentity(item)}|${normalisedUnit(item.unit)}`;
}

function splitCompoundName(item: ShoppingRecord) {
  const normalised = normaliseProductText(item.name);
  if (normalised.includes("mint leaves") && normalised.includes("lemon wedges")) {
    return ["Mint leaves", "Lemon"];
  }
  return null;
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
    const canonicalName = cleanCanonicalName(
      keeper.product?.canonicalName ?? keeper.product?.name ?? keeper.name,
    );
    const productId = group.find((item) => item.productId)?.productId ?? null;
    const checked = group.every((item) => item.checked);

    await prisma.$transaction([
      prisma.shoppingItem.update({
        where: { id: keeper.id },
        data: {
          name: canonicalName || keeper.name,
          quantity,
          unit: normalisedUnit(keeper.unit),
          productId,
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

export async function consolidateShoppingItems() {
  // Re-run until the list reaches a stable canonical form. This makes every
  // refresh authoritative, including existing rows created before the current
  // normalisation rules were introduced.
  for (let pass = 0; pass < 4; pass += 1) {
    const beforeSplit = await readShoppingItems();
    const splitChanged = await splitKnownCompoundItems(beforeSplit);
    const afterSplit = splitChanged ? await readShoppingItems() : beforeSplit;
    const mergeChanged = await mergeDuplicateItems(afterSplit);

    if (!splitChanged && !mergeChanged) break;
  }
}
