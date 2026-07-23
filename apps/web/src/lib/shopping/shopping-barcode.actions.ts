"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ShoppingActionState } from "./shopping.types";

const maximumQuantity = 100_000;

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function parseQuantity(rawValue: string) {
  const quantity = Number(rawValue);
  return rawValue && Number.isFinite(quantity) ? quantity : null;
}

function validateBarcode(value: string) {
  if (!value) return null;
  if (value.length < 4 || value.length > 80 || /\s/.test(value)) {
    return "Enter a barcode between 4 and 80 characters without spaces.";
  }
  return null;
}

async function resolveProduct(
  transaction: Prisma.TransactionClient,
  name: string,
  barcode: string | null,
) {
  if (barcode) {
    const productWithBarcode = await transaction.product.findUnique({ where: { barcode } });
    if (productWithBarcode) return productWithBarcode;
  }

  const productWithName = await transaction.product.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
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

  return transaction.product.create({ data: { name, barcode } });
}

export async function addBarcodeShoppingItem(
  listId: string,
  _previousState: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const name = textValue(formData, "name");
  const barcodeRaw = textValue(formData, "barcode");
  const barcode = barcodeRaw || null;
  const quantity = parseQuantity(textValue(formData, "quantity"));
  const unit = textValue(formData, "unit");
  const fieldErrors: Record<string, string> = {};

  if (name.length < 2 || name.length > 100) {
    fieldErrors.name = "Enter a product name between 2 and 100 characters.";
  }

  const barcodeError = validateBarcode(barcodeRaw);
  if (barcodeError) fieldErrors.barcode = barcodeError;

  if (quantity === null || quantity <= 0 || quantity > maximumQuantity) {
    fieldErrors.quantity = "Enter a quantity greater than 0.";
  }

  if (!unit || unit.length > 30) {
    fieldErrors.unit = "Enter a unit of up to 30 characters.";
  }

  if (Object.keys(fieldErrors).length > 0 || quantity === null) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const list = await transaction.shoppingList.findUnique({
        where: { id: listId },
        select: { id: true },
      });

      if (!list) return { status: "missing" as const, name };

      const product = await resolveProduct(transaction, name, barcode);
      const duplicate = await transaction.shoppingItem.findFirst({
        where: {
          shoppingListId: listId,
          name: { equals: product.name, mode: "insensitive" },
        },
        select: { id: true, checked: true },
      });

      if (duplicate) {
        if (duplicate.checked) {
          await transaction.shoppingItem.update({
            where: { id: duplicate.id },
            data: { checked: false, stockedAt: null, quantity, unit },
          });
          return { status: "restored" as const, name: product.name };
        }
        return { status: "duplicate" as const, name: product.name };
      }

      await transaction.shoppingItem.create({
        data: {
          shoppingListId: listId,
          name: product.name,
          quantity,
          unit,
        },
      });

      return { status: "created" as const, name: product.name };
    });

    if (result.status === "missing") {
      return { status: "error", message: "This shopping list no longer exists." };
    }

    if (result.status === "duplicate") {
      return { status: "error", message: `${result.name} is already on this shopping list.` };
    }

    revalidatePath("/shopping");
    revalidatePath("/pantry");

    return {
      status: "success",
      message: result.status === "restored"
        ? `${result.name} was moved back to the active list.`
        : `${result.name} was added.`,
    };
  } catch (error) {
    console.error("Unable to add barcode Shopping item", error);
    return { status: "error", message: "The shopping item could not be added." };
  }
}
