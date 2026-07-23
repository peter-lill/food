"use server";

import { InventoryLocation } from "@prisma/client";
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

function refreshPantryPages() {
  revalidatePath("/pantry");
  revalidatePath("/");
}

export async function createPantryItem(
  _previousState: PantryActionState,
  formData: FormData,
): Promise<PantryActionState> {
  const name = textValue(formData, "name");
  const parsed = parseStockFields(formData);
  const fieldErrors = parsed.ok ? {} : { ...parsed.fieldErrors };

  if (name.length < 2 || name.length > 100) {
    fieldErrors.name = "Enter a product name between 2 and 100 characters.";
  }

  if (Object.keys(fieldErrors).length > 0 || !parsed.ok) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const existingProduct = await transaction.product.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive",
          },
        },
      });

      const product = existingProduct ?? await transaction.product.create({
        data: { name },
      });

      await transaction.inventoryItem.create({
        data: {
          productId: product.id,
          ...parsed.data,
        },
      });
    });

    refreshPantryPages();
    return { status: "success", message: `${name} was added to your pantry.` };
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

async function deletePantryItemAndOrphanedProduct(itemId: string) {
  await prisma.$transaction(async (transaction) => {
    const item = await transaction.inventoryItem.findUnique({
      where: { id: itemId },
      select: { productId: true },
    });

    if (!item) return;

    await transaction.inventoryItem.delete({ where: { id: itemId } });

    const remainingItems = await transaction.inventoryItem.count({
      where: { productId: item.productId },
    });

    if (remainingItems === 0) {
      await transaction.product.delete({ where: { id: item.productId } });
    }
  });
}

export async function consumePantryItem(itemId: string, _formData: FormData) {
  try {
    await deletePantryItemAndOrphanedProduct(itemId);
    refreshPantryPages();
  } catch (error) {
    console.error("Unable to consume pantry item", error);
  }
}

export async function removePantryItem(itemId: string, _formData: FormData) {
  try {
    await deletePantryItemAndOrphanedProduct(itemId);
    refreshPantryPages();
  } catch (error) {
    console.error("Unable to remove pantry item", error);
  }
}
