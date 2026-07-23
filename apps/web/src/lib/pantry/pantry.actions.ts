"use server";

import { InventoryLocation, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { PantryActionState } from "./pantry.types";
import { pantryLocations } from "./pantry.types";

const maximumQuantity = 100_000;

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function dateValue(rawValue: string) {
  if (!rawValue) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return undefined;

  const date = new Date(`${rawValue}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseBarcode(formData: FormData) {
  const barcode = textValue(formData, "barcode");
  if (!barcode) return { value: null, error: null };

  if (barcode.length < 4 || barcode.length > 80 || /\s/.test(barcode)) {
    return {
      value: null,
      error: "Enter a barcode between 4 and 80 characters without spaces.",
    };
  }

  return { value: barcode, error: null };
}

function parseStockFields(formData: FormData) {
  const quantityRaw = textValue(formData, "quantity");
  const quantity = Number(quantityRaw);
  const unit = textValue(formData, "unit");
  const locationRaw = textValue(formData, "location");
  const purchasedAtRaw = textValue(formData, "purchasedAt");
  const expiresAtRaw = textValue(formData, "expiresAt");
  const purchasedAt = dateValue(purchasedAtRaw);
  const expiresAt = dateValue(expiresAtRaw);
  const fieldErrors: Record<string, string> = {};

  if (!quantityRaw || !Number.isFinite(quantity) || quantity <= 0 || quantity > maximumQuantity) {
    fieldErrors.quantity = `Enter a quantity greater than 0 and no more than ${maximumQuantity.toLocaleString("en-AU")}.`;
  }

  if (!unit || unit.length > 30) {
    fieldErrors.unit = "Enter a unit of up to 30 characters.";
  }

  if (!pantryLocations.includes(locationRaw as (typeof pantryLocations)[number])) {
    fieldErrors.location = "Choose Pantry, Fridge or Freezer.";
  }

  if (purchasedAt === undefined) {
    fieldErrors.purchasedAt = "Enter a valid purchase date.";
  }

  if (expiresAt === undefined) {
    fieldErrors.expiresAt = "Enter a valid expiry date.";
  }

  if (purchasedAt && expiresAt && expiresAt < purchasedAt) {
    fieldErrors.expiresAt = "Expiry date cannot be before the purchase date.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false as const, fieldErrors };
  }

  return {
    ok: true as const,
    data: {
      quantity,
      unit,
      location: locationRaw as InventoryLocation,
      purchasedAt,
      expiresAt,
    },
  };
}

async function resolveProduct(
  transaction: Prisma.TransactionClient,
  name: string,
  barcode: string | null,
) {
  if (barcode) {
    const productWithBarcode = await transaction.product.findUnique({
      where: { barcode },
    });

    if (productWithBarcode) return productWithBarcode;
  }

  const productWithName = await transaction.product.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
  });

  if (productWithName && (!barcode || productWithName.barcode === barcode)) {
    return productWithName;
  }

  if (productWithName && barcode && !productWithName.barcode) {
    return transaction.product.update({
      where: { id: productWithName.id },
      data: { barcode },
    });
  }

  return transaction.product.create({
    data: { name, barcode },
  });
}

function refreshPantryPages() {
  revalidatePath("/pantry");
  revalidatePath("/shopping");
  revalidatePath("/");
}

export async function createPantryItem(
  _previousState: PantryActionState,
  formData: FormData,
): Promise<PantryActionState> {
  const name = textValue(formData, "name");
  const barcode = parseBarcode(formData);
  const parsed = parseStockFields(formData);
  const fieldErrors: Record<string, string> = parsed.ok ? {} : { ...parsed.fieldErrors };

  if (name.length < 2 || name.length > 100) {
    fieldErrors.name = "Enter a product name between 2 and 100 characters.";
  }

  if (barcode.error) fieldErrors.barcode = barcode.error;

  if (Object.keys(fieldErrors).length > 0 || !parsed.ok) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  let savedName = name;

  try {
    await prisma.$transaction(async (transaction) => {
      const product = await resolveProduct(transaction, name, barcode.value);
      savedName = product.name;

      await transaction.inventoryItem.create({
        data: {
          productId: product.id,
          ...parsed.data,
        },
      });
    });

    refreshPantryPages();
    return { status: "success", message: `${savedName} was added to your pantry.` };
  } catch (error) {
    console.error("Unable to create pantry item", error);
    return {
      status: "error",
      message: "The pantry item could not be saved. Check the database connection and try again.",
    };
  }
}

export async function updatePantryItem(
  itemId: string,
  _previousState: PantryActionState,
  formData: FormData,
): Promise<PantryActionState> {
  const parsed = parseStockFields(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    await prisma.inventoryItem.update({
      where: { id: itemId },
      data: parsed.data,
    });

    refreshPantryPages();
    return { status: "success", message: "Pantry item updated." };
  } catch (error) {
    console.error("Unable to update pantry item", error);
    return {
      status: "error",
      message: "The pantry item could not be updated. It may no longer exist.",
    };
  }
}

async function deletePantryItem(itemId: string) {
  await prisma.inventoryItem.deleteMany({ where: { id: itemId } });
}

export async function consumePantryItem(itemId: string, _formData: FormData) {
  try {
    await deletePantryItem(itemId);
    refreshPantryPages();
  } catch (error) {
    console.error("Unable to consume pantry item", error);
  }
}

export async function consumePantryItemAndAddToShoppingList(itemId: string, formData: FormData) {
  const shoppingListId = textValue(formData, "shoppingListId");
  if (!shoppingListId) return;

  try {
    const completed = await prisma.$transaction(async (transaction) => {
      const pantryItem = await transaction.inventoryItem.findUnique({
        where: { id: itemId },
        include: { product: true },
      });

      if (!pantryItem) return false;

      const shoppingList = await transaction.shoppingList.findUnique({
        where: { id: shoppingListId },
        select: { id: true },
      });

      if (!shoppingList) return false;

      const existing = await transaction.shoppingItem.findFirst({
        where: {
          shoppingListId,
          name: { equals: pantryItem.product.name, mode: "insensitive" },
        },
      });

      if (existing) {
        await transaction.shoppingItem.update({
          where: { id: existing.id },
          data: {
            checked: false,
            stockedAt: null,
            quantity: existing.quantity ?? 1,
            unit: existing.unit ?? pantryItem.unit,
          },
        });
      } else {
        await transaction.shoppingItem.create({
          data: {
            shoppingListId,
            name: pantryItem.product.name,
            quantity: 1,
            unit: pantryItem.unit,
          },
        });
      }

      await transaction.inventoryItem.delete({ where: { id: pantryItem.id } });
      return true;
    });

    if (completed) refreshPantryPages();
  } catch (error) {
    console.error("Unable to consume pantry item and add replacement", error);
  }
}

export async function removePantryItem(itemId: string, _formData: FormData) {
  try {
    await deletePantryItem(itemId);
    refreshPantryPages();
  } catch (error) {
    console.error("Unable to remove pantry item", error);
  }
}
