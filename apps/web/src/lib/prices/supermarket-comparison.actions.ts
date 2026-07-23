"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  supermarketRetailers,
  type SupermarketPriceActionState,
  type SupermarketRetailer,
} from "./supermarket-comparison.types";

const maximumLines = 200;
const maximumPrice = 5000;

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function moneyValue(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : undefined;
}

function specialValue(value: string) {
  return ["special", "yes", "true", "y", "1"].includes(value.trim().toLocaleLowerCase("en-AU"));
}

function captureDate(rawValue: string) {
  if (!rawValue) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return null;
  const value = new Date(`${rawValue}T12:00:00+10:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export async function importSupermarketPrices(
  _previousState: SupermarketPriceActionState,
  formData: FormData,
): Promise<SupermarketPriceActionState> {
  const retailer = textValue(formData, "retailer") as SupermarketRetailer;
  const checkedAt = captureDate(textValue(formData, "checkedAt"));
  const rawLines = textValue(formData, "lines");
  const fieldErrors: Record<string, string> = {};

  if (!supermarketRetailers.includes(retailer)) {
    fieldErrors.retailer = "Choose Woolworths, Coles or ALDI.";
  }

  if (!checkedAt) {
    fieldErrors.checkedAt = "Enter a valid checked date.";
  }

  const lines = rawLines.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    fieldErrors.lines = "Enter at least one price line.";
  } else if (lines.length > maximumLines) {
    fieldErrors.lines = `Import no more than ${maximumLines} lines at once.`;
  }

  if (Object.keys(fieldErrors).length > 0 || !checkedAt) {
    return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors };
  }

  const rows: Array<{
    retailer: string;
    productName: string;
    brand: string | null;
    packSize: string | null;
    price: number;
    unitPrice: number | null;
    isSpecial: boolean;
    checkedAt: Date;
  }> = [];
  const lineErrors: string[] = [];

  lines.forEach((line, index) => {
    const [productRaw = "", priceRaw = "", packSizeRaw = "", unitPriceRaw = "", brandRaw = "", specialRaw = ""] = line
      .split("|")
      .map((part) => part.trim());
    const price = moneyValue(priceRaw);
    const unitPrice = moneyValue(unitPriceRaw);

    if (productRaw.length < 2 || productRaw.length > 120) {
      lineErrors.push(`Line ${index + 1}: product name must be 2 to 120 characters.`);
      return;
    }

    if (price === undefined || price === null || price <= 0 || price > maximumPrice) {
      lineErrors.push(`Line ${index + 1}: enter a valid shelf price.`);
      return;
    }

    if (unitPrice === undefined || (unitPrice !== null && (unitPrice <= 0 || unitPrice > maximumPrice))) {
      lineErrors.push(`Line ${index + 1}: unit price is invalid.`);
      return;
    }

    if (packSizeRaw.length > 40 || brandRaw.length > 80) {
      lineErrors.push(`Line ${index + 1}: pack size or brand is too long.`);
      return;
    }

    rows.push({
      retailer,
      productName: productRaw,
      brand: brandRaw || null,
      packSize: packSizeRaw || null,
      price,
      unitPrice,
      isSpecial: specialValue(specialRaw),
      checkedAt,
    });
  });

  if (lineErrors.length > 0) {
    return {
      status: "error",
      message: "Some price lines could not be imported.",
      fieldErrors: { lines: lineErrors.slice(0, 5).join(" ") },
    };
  }

  try {
    const result = await prisma.supermarketPrice.createMany({ data: rows });
    revalidatePath("/prices");
    return {
      status: "success",
      message: `${result.count} price ${result.count === 1 ? "was" : "were"} added to the comparison catalogue.`,
      importedCount: result.count,
    };
  } catch (error) {
    console.error("Unable to import supermarket prices", error);
    return { status: "error", message: "The supermarket prices could not be saved." };
  }
}
