"use server";

import { InventoryLocation, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ShoppingActionState } from "./shopping.types";

const maximumQuantity = 100_000;

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function quantityValue(rawValue: string) {
  if (!rawValue) return null;
  const quantity = Number(rawValue);
  return Number.isFinite(quantity) ? quantity : undefined;
}

function validateItem(formData: FormData) {
  const name = textValue(formData, "name");
  const quantityRaw = textValue(formData, "quantity");
  const quantity = quantityValue(quantityRaw);
  const unit = textValue(formData, "unit");
  const fieldErrors: Record<string, string> = {};

  if (name.length < 2 || name.length > 100) {
    fieldErrors.name = "Enter an item name between 2 and 100 characters.";
  }

  if (quantity === undefined || quantity === null || quantity <= 0 || quantity > maximumQuantity) {
    fieldErrors.quantity = "Enter a quantity greater than 0.";
  }

  if (!unit || unit.length > 30) {
    fieldErrors.unit = "Enter a unit of up to 30 characters.";
  }

  if (Object.keys(fieldErrors).length > 0 || quantity === null || quantity === undefined) {
    return { ok: false as const, fieldErrors };
  }

  return { ok: true as const, data: { name, quantity, unit } };
}

function refreshShopping() {
  revalidatePath("/shopping");
  revalidatePath("/pantry");
  revalidatePath("/");
}

function inferInventoryLocation(name: string): InventoryLocation {
  const normalised = name.toLocaleLowerCase("en-AU");
  const freezerKeywords = ["frozen", "ice cream", "ice-cream"];
  const fridgeKeywords = [
    "beef", "butter", "cheese", "chicken", "cream", "egg", "fish", "ham", "lamb",
    "milk", "mince", "pork", "prawn", "salmon", "sausage", "steak", "turkey",
    "yoghurt", "yogurt",
  ];

  if (freezerKeywords.some((keyword) => normalised.includes(keyword))) return InventoryLocation.FREEZER;
  if (fridgeKeywords.some((keyword) => normalised.includes(keyword))) return InventoryLocation.FRIDGE;
  return InventoryLocation.PANTRY;
}

function brisbaneToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}

async function resolveShoppingProduct(transaction: Prisma.TransactionClient, name: string) {
  const existing = await transaction.product.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });

  return existing ?? transaction.product.create({ data: { name } });
}

export async function createShoppingList(
  _previousState: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const name = textValue(formData, "name");

  if (name.length < 2 || name.length > 80) {
    return {
      status: "error",
      message: "Check the list name and try again.",
      fieldErrors: { name: "Enter a list name between 2 and 80 characters." },
    };
  }

  let listId: string;

  try {
    const duplicate = await prisma.shoppingList.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });

    if (duplicate) {
      return { status: "error", message: "A shopping list with this name already exists." };
    }

    const list = await prisma.shoppingList.create({
      data: { name },
      select: { id: true },
    });
    listId = list.id;
  } catch (error) {
    console.error("Unable to create shopping list", error);
    return { status: "error", message: "The shopping list could not be created." };
  }

  refreshShopping();
  redirect(`/shopping?list=${listId}`);
}

export async function renameShoppingList(
  listId: string,
  _previousState: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const name = textValue(formData, "name");

  if (name.length < 2 || name.length > 80) {
    return {
      status: "error",
      message: "Check the list name and try again.",
      fieldErrors: { name: "Enter a list name between 2 and 80 characters." },
    };
  }

  try {
    const duplicate = await prisma.shoppingList.findFirst({
      where: {
        id: { not: listId },
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (duplicate) {
      return { status: "error", message: "A shopping list with this name already exists." };
    }

    const result = await prisma.shoppingList.updateMany({
      where: { id: listId },
      data: { name },
    });

    if (result.count !== 1) {
      return { status: "error", message: "This shopping list no longer exists." };
    }

    refreshShopping();
    return { status: "success", message: "Shopping list renamed." };
  } catch (error) {
    console.error("Unable to rename shopping list", error);
    return { status: "error", message: "The shopping list could not be renamed." };
  }
}

export async function deleteShoppingList(listId: string, _formData: FormData) {
  try {
    await prisma.shoppingList.deleteMany({ where: { id: listId } });
    refreshShopping();
  } catch (error) {
    console.error("Unable to delete shopping list", error);
  }

  redirect("/shopping");
}

export async function addShoppingItem(
  listId: string,
  _previousState: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const parsed = validateItem(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const list = await prisma.shoppingList.findUnique({
      where: { id: listId },
      select: { id: true },
    });

    if (!list) return { status: "error", message: "This shopping list no longer exists." };

    const duplicate = await prisma.shoppingItem.findFirst({
      where: {
        shoppingListId: listId,
        name: { equals: parsed.data.name, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (duplicate) {
      return { status: "error", message: "That item is already on this shopping list." };
    }

    await prisma.shoppingItem.create({
      data: {
        shoppingListId: listId,
        ...parsed.data,
      },
    });

    refreshShopping();
    return { status: "success", message: `${parsed.data.name} was added.` };
  } catch (error) {
    console.error("Unable to add shopping item", error);
    return { status: "error", message: "The shopping item could not be added." };
  }
}

export async function updateShoppingItem(
  listId: string,
  itemId: string,
  _previousState: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const parsed = validateItem(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const duplicate = await prisma.shoppingItem.findFirst({
      where: {
        id: { not: itemId },
        shoppingListId: listId,
        name: { equals: parsed.data.name, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (duplicate) {
      return { status: "error", message: "That item is already on this shopping list." };
    }

    const result = await prisma.shoppingItem.updateMany({
      where: { id: itemId, shoppingListId: listId },
      data: parsed.data,
    });

    if (result.count !== 1) {
      return { status: "error", message: "This shopping item no longer exists." };
    }

    refreshShopping();
    return { status: "success", message: "Shopping item updated." };
  } catch (error) {
    console.error("Unable to update shopping item", error);
    return { status: "error", message: "The shopping item could not be updated." };
  }
}

export async function toggleShoppingItem(listId: string, itemId: string, formData: FormData) {
  const nextChecked = textValue(formData, "nextChecked") === "true";

  try {
    const changed = await prisma.$transaction(async (transaction) => {
      const item = await transaction.shoppingItem.findFirst({
        where: { id: itemId, shoppingListId: listId },
        select: {
          id: true,
          name: true,
          quantity: true,
          unit: true,
          checked: true,
          stockedAt: true,
        },
      });

      if (!item) return false;

      if (!nextChecked) {
        await transaction.shoppingItem.update({
          where: { id: item.id },
          data: { checked: false },
        });
        return true;
      }

      if (item.checked) return false;

      const stockedAt = item.stockedAt ?? new Date();

      if (!item.stockedAt) {
        const product = await resolveShoppingProduct(transaction, item.name);
        await transaction.inventoryItem.create({
          data: {
            productId: product.id,
            location: inferInventoryLocation(product.name),
            quantity: item.quantity ?? 1,
            unit: item.unit || "item",
            purchasedAt: brisbaneToday(),
            expiresAt: null,
          },
        });
      }

      await transaction.shoppingItem.update({
        where: { id: item.id },
        data: { checked: true, stockedAt },
      });

      return true;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    if (changed) refreshShopping();
  } catch (error) {
    console.error("Unable to purchase shopping item and add it to Pantry", error);
  }
}

export async function removeShoppingItem(listId: string, itemId: string, _formData: FormData) {
  try {
    await prisma.shoppingItem.deleteMany({
      where: { id: itemId, shoppingListId: listId },
    });
    refreshShopping();
  } catch (error) {
    console.error("Unable to remove shopping item", error);
  }
}

export async function clearCompletedShoppingItems(listId: string, _formData: FormData) {
  try {
    await prisma.shoppingItem.deleteMany({
      where: { shoppingListId: listId, checked: true },
    });
    refreshShopping();
  } catch (error) {
    console.error("Unable to clear completed shopping items", error);
  }
}

export async function addPantryItemToShoppingList(
  listId: string,
  inventoryItemId: string,
  _formData: FormData,
) {
  try {
    const pantryItem = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      include: { product: true },
    });

    if (!pantryItem) return;

    const existing = await prisma.shoppingItem.findFirst({
      where: {
        shoppingListId: listId,
        name: { equals: pantryItem.product.name, mode: "insensitive" },
      },
    });

    if (existing) {
      await prisma.shoppingItem.update({
        where: { id: existing.id },
        data: {
          checked: false,
          stockedAt: null,
          quantity: existing.quantity ?? 1,
          unit: existing.unit ?? pantryItem.unit,
        },
      });
    } else {
      await prisma.shoppingItem.create({
        data: {
          shoppingListId: listId,
          name: pantryItem.product.name,
          quantity: 1,
          unit: pantryItem.unit,
        },
      });
    }

    refreshShopping();
  } catch (error) {
    console.error("Unable to add Pantry item to shopping list", error);
  }
}
