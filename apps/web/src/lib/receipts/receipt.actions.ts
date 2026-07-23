"use server";

import { createHash } from "node:crypto";
import { InventoryLocation, ReceiptStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pantryLocations } from "@/lib/pantry/pantry.types";
import type { ReceiptActionState } from "./receipt.types";

const maximumReceiptItems = 100;
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

function optionalNumber(rawValue: string) {
  if (!rawValue) return null;
  const value = Number(rawValue.replace(/[$,]/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

function normaliseDescription(value: string) {
  return value.replace(/^[-•*]\s*/, "").replace(/\s+/g, " ").trim();
}

function parseReceiptLine(line: string) {
  const cleaned = normaliseDescription(line);
  const parts = cleaned.split("|").map((part) => part.trim());
  let rawDescription = cleaned;
  let quantity: number | null = 1;
  let price: number | null = null;

  if (parts.length >= 3) {
    rawDescription = parts[0];
    const parsedQuantity = optionalNumber(parts[1]);
    const parsedPrice = optionalNumber(parts[2]);
    quantity = parsedQuantity === undefined ? 1 : parsedQuantity;
    price = parsedPrice === undefined ? null : parsedPrice;
  } else if (parts.length === 2) {
    rawDescription = parts[0];
    const parsedPrice = optionalNumber(parts[1]);
    price = parsedPrice === undefined ? null : parsedPrice;
  } else {
    const priceMatch = cleaned.match(/\s+\$(\d+(?:\.\d{1,2})?)\s*$/);
    if (priceMatch) {
      price = Number(priceMatch[1]);
      rawDescription = cleaned.slice(0, priceMatch.index).trim();
    }
  }

  return {
    rawDescription: rawDescription.slice(0, 300),
    normalisedName: rawDescription.slice(0, 100),
    quantity: quantity && quantity > 0 ? quantity : 1,
    price,
  };
}

function fingerprintReceipt(retailer: string, purchasedAt: string, total: number, lines: string[]) {
  const input = [
    retailer.toLocaleLowerCase("en-AU"),
    purchasedAt,
    total.toFixed(2),
    ...lines.map((line) => normaliseDescription(line).toLocaleLowerCase("en-AU")),
  ].join("\n");

  return createHash("sha256").update(input).digest("hex");
}

function refreshReceiptPages(receiptId?: string) {
  revalidatePath("/receipts");
  if (receiptId) revalidatePath(`/receipts/${receiptId}`);
}

export async function createReceiptImport(
  _previousState: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const retailer = textValue(formData, "retailer");
  const purchasedAtRaw = textValue(formData, "purchasedAt");
  const purchasedAt = dateValue(purchasedAtRaw);
  const totalRaw = textValue(formData, "total");
  const total = optionalNumber(totalRaw);
  const linesRaw = textValue(formData, "lines");
  const lines = linesRaw.split(/\r?\n/).map(normaliseDescription).filter(Boolean);
  const fieldErrors: Record<string, string> = {};

  if (retailer.length < 2 || retailer.length > 100) {
    fieldErrors.retailer = "Enter a retailer between 2 and 100 characters.";
  }

  if (!purchasedAtRaw || !purchasedAt) {
    fieldErrors.purchasedAt = "Enter a valid purchase date.";
  }

  if (total === undefined || total === null || total < 0 || total > 1_000_000) {
    fieldErrors.total = "Enter a valid receipt total.";
  }

  if (lines.length === 0) {
    fieldErrors.lines = "Paste or enter at least one receipt line.";
  } else if (lines.length > maximumReceiptItems) {
    fieldErrors.lines = `A receipt can contain no more than ${maximumReceiptItems} lines.`;
  } else if (lines.some((line) => line.length > 300)) {
    fieldErrors.lines = "Each receipt line must be no more than 300 characters.";
  }

  if (Object.keys(fieldErrors).length > 0 || !purchasedAt || total === null || total === undefined) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  const fingerprint = fingerprintReceipt(retailer, purchasedAtRaw, total, lines);
  let receiptId: string;

  try {
    const duplicate = await prisma.receiptImport.findUnique({
      where: { fingerprint },
      select: { id: true },
    });

    if (duplicate) {
      return {
        status: "error",
        message: "This receipt has already been entered. Open it from receipt history instead.",
      };
    }

    const receipt = await prisma.receiptImport.create({
      data: {
        retailer,
        purchasedAt,
        total,
        fingerprint,
        items: {
          create: lines.map(parseReceiptLine),
        },
      },
      select: { id: true },
    });

    receiptId = receipt.id;
  } catch (error) {
    console.error("Unable to create receipt", error);
    return {
      status: "error",
      message: "The receipt could not be saved. Check the database connection and try again.",
    };
  }

  refreshReceiptPages(receiptId);
  redirect(`/receipts/${receiptId}`);
}

export async function updateReceiptItem(
  receiptId: string,
  itemId: string,
  _previousState: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const classification = textValue(formData, "classification");
  const normalisedName = textValue(formData, "normalisedName");
  const quantityRaw = textValue(formData, "quantity");
  const quantity = optionalNumber(quantityRaw);
  const unit = textValue(formData, "unit");
  const priceRaw = textValue(formData, "price");
  const price = optionalNumber(priceRaw);
  const locationRaw = textValue(formData, "location");
  const expiresAtRaw = textValue(formData, "expiresAt");
  const expiresAt = dateValue(expiresAtRaw);
  const fieldErrors: Record<string, string> = {};

  if (!['food', 'non-food'].includes(classification)) {
    fieldErrors.classification = "Choose Food or Non-food.";
  }

  if (price === undefined || (price !== null && (price < 0 || price > 1_000_000))) {
    fieldErrors.price = "Enter a valid line price.";
  }

  if (classification === "food") {
    if (normalisedName.length < 2 || normalisedName.length > 100) {
      fieldErrors.normalisedName = "Enter a product name between 2 and 100 characters.";
    }

    if (quantity === undefined || quantity === null || quantity <= 0 || quantity > maximumQuantity) {
      fieldErrors.quantity = "Enter a quantity greater than 0.";
    }

    if (!unit || unit.length > 30) {
      fieldErrors.unit = "Enter a unit of up to 30 characters.";
    }

    if (!pantryLocations.includes(locationRaw as (typeof pantryLocations)[number])) {
      fieldErrors.location = "Choose Pantry, Fridge or Freezer.";
    }

    if (expiresAt === undefined) {
      fieldErrors.expiresAt = "Enter a valid expiry date.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  try {
    const item = await prisma.receiptItem.findUnique({
      where: { id: itemId },
      include: { receiptImport: { select: { id: true, status: true } } },
    });

    if (!item || item.receiptImport.id !== receiptId) {
      return { status: "error", message: "This receipt line no longer exists." };
    }

    if (item.receiptImport.status !== ReceiptStatus.DRAFT) {
      return { status: "error", message: "Only draft receipts can be edited." };
    }

    await prisma.receiptItem.update({
      where: { id: itemId },
      data: classification === "food"
        ? {
            isFood: true,
            normalisedName,
            quantity: quantity as number,
            unit,
            price,
            location: locationRaw as InventoryLocation,
            expiresAt,
          }
        : {
            isFood: false,
            normalisedName: null,
            quantity: null,
            unit: null,
            price,
            location: null,
            expiresAt: null,
          },
    });

    refreshReceiptPages(receiptId);
    return { status: "success", message: "Receipt line saved." };
  } catch (error) {
    console.error("Unable to update receipt line", error);
    return { status: "error", message: "The receipt line could not be saved." };
  }
}

export async function addReceiptItem(
  receiptId: string,
  _previousState: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const rawDescription = normaliseDescription(textValue(formData, "rawDescription"));

  if (rawDescription.length < 2 || rawDescription.length > 300) {
    return {
      status: "error",
      message: "Enter a receipt description between 2 and 300 characters.",
      fieldErrors: { rawDescription: "Enter a valid receipt description." },
    };
  }

  try {
    const receipt = await prisma.receiptImport.findUnique({
      where: { id: receiptId },
      select: { status: true, _count: { select: { items: true } } },
    });

    if (!receipt || receipt.status !== ReceiptStatus.DRAFT) {
      return { status: "error", message: "Only draft receipts can be changed." };
    }

    if (receipt._count.items >= maximumReceiptItems) {
      return { status: "error", message: `A receipt can contain no more than ${maximumReceiptItems} lines.` };
    }

    await prisma.receiptItem.create({
      data: {
        receiptImportId: receiptId,
        ...parseReceiptLine(rawDescription),
      },
    });

    refreshReceiptPages(receiptId);
    return { status: "success", message: "Receipt line added." };
  } catch (error) {
    console.error("Unable to add receipt line", error);
    return { status: "error", message: "The receipt line could not be added." };
  }
}

export async function removeReceiptItem(receiptId: string, itemId: string, _formData: FormData) {
  try {
    await prisma.receiptItem.deleteMany({
      where: {
        id: itemId,
        receiptImportId: receiptId,
        receiptImport: { status: ReceiptStatus.DRAFT },
      },
    });
    refreshReceiptPages(receiptId);
  } catch (error) {
    console.error("Unable to remove receipt line", error);
  }
}

class ReceiptImportError extends Error {}

export async function finaliseReceiptImport(
  receiptId: string,
  _previousState: ReceiptActionState,
  _formData: FormData,
): Promise<ReceiptActionState> {
  try {
    const importedCount = await prisma.$transaction(async (transaction) => {
      const receipt = await transaction.receiptImport.findUnique({
        where: { id: receiptId },
        include: { items: true },
      });

      if (!receipt) throw new ReceiptImportError("The receipt no longer exists.");
      if (receipt.status !== ReceiptStatus.DRAFT) throw new ReceiptImportError("This receipt has already been finalised.");
      if (receipt.items.length === 0) throw new ReceiptImportError("Add at least one receipt line before importing.");

      const unreviewed = receipt.items.filter((item) => item.isFood === null);
      if (unreviewed.length > 0) {
        throw new ReceiptImportError(`Review all receipt lines before importing. ${unreviewed.length} remain.`);
      }

      const foodItems = receipt.items.filter((item) => item.isFood === true);
      if (foodItems.length === 0) throw new ReceiptImportError("Mark at least one receipt line as food before importing.");

      for (const item of foodItems) {
        if (!item.normalisedName || !item.quantity || !item.unit || !item.location) {
          throw new ReceiptImportError(`Complete the Pantry details for ${item.rawDescription}.`);
        }
      }

      const claimed = await transaction.receiptImport.updateMany({
        where: { id: receiptId, status: ReceiptStatus.DRAFT },
        data: { status: ReceiptStatus.IMPORTED, importedAt: new Date() },
      });

      if (claimed.count !== 1) throw new ReceiptImportError("This receipt has already been finalised.");

      for (const item of foodItems) {
        const productName = item.normalisedName as string;
        const existingProduct = await transaction.product.findFirst({
          where: { name: { equals: productName, mode: "insensitive" } },
        });
        const product = existingProduct ?? await transaction.product.create({
          data: { name: productName },
        });

        await transaction.inventoryItem.create({
          data: {
            productId: product.id,
            quantity: item.quantity as number,
            unit: item.unit as string,
            location: item.location as InventoryLocation,
            purchasedAt: receipt.purchasedAt,
            expiresAt: item.expiresAt,
          },
        });
      }

      return foodItems.length;
    });

    refreshReceiptPages(receiptId);
    revalidatePath("/pantry");
    revalidatePath("/");
    return {
      status: "success",
      message: `${importedCount} ${importedCount === 1 ? "item was" : "items were"} added to your Pantry.`,
    };
  } catch (error) {
    if (error instanceof ReceiptImportError) {
      return { status: "error", message: error.message };
    }

    console.error("Unable to finalise receipt", error);
    return { status: "error", message: "The receipt could not be imported. No Pantry items were added." };
  }
}

export async function cancelReceiptImport(receiptId: string, _formData: FormData) {
  try {
    await prisma.receiptImport.updateMany({
      where: { id: receiptId, status: ReceiptStatus.DRAFT },
      data: { status: ReceiptStatus.CANCELLED },
    });
    refreshReceiptPages(receiptId);
  } catch (error) {
    console.error("Unable to cancel receipt", error);
  }

  redirect("/receipts");
}
