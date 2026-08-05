"use server";

import { ProductType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { enrichProductKnowledge } from "@/lib/product-intelligence/barcode-enrichment";
import { productDepartment, supermarketDepartments } from "./product-category";

const servingUnits = ["g", "mL", "item", "slice", "piece", "tablet", "capsule"] as const;

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim();
}

function nullable(value: string) {
  return value || null;
}

function optionalNumber(formData: FormData, name: string) {
  const value = text(formData, name);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return parsed;
}

function normaliseBarcode(value: string) {
  return value.replace(/\D/g, "");
}

function normaliseDepartment(value: string, productType: ProductType, productName: string) {
  const normalised = value.toLocaleLowerCase("en-AU").trim();
  if (productType === ProductType.GENERIC_PRODUCE && ["fresh produce", "produce", "fruit and vegetables", "fruit & vegetables"].includes(normalised)) {
    return "Fruit & vegetables";
  }
  return value ? productDepartment(value, productName) : "";
}

function parseAllergens(value: string) {
  return [...new Set(
    value
      .split(/[,;\n]/)
      .map((item) => item.replace(/^[a-z]{2}:/i, "").trim().toLocaleLowerCase("en-AU"))
      .filter(Boolean),
  )].slice(0, 30);
}

export async function updateProductDetails(productId: string, formData: FormData) {
  const name = text(formData, "name");
  const brand = text(formData, "brand");
  const packSize = text(formData, "packSize");
  const barcodeInput = text(formData, "barcode");
  const barcode = barcodeInput ? normaliseBarcode(barcodeInput) : "";
  const productTypeInput = text(formData, "productType");
  const servingSize = text(formData, "servingSize");
  const servingQuantity = optionalNumber(formData, "servingQuantity");
  const servingUnit = text(formData, "servingUnit");
  const servingsPerPackage = optionalNumber(formData, "servingsPerPackage");
  const allergensInput = text(formData, "allergens");
  const allergens = parseAllergens(allergensInput);

  if (name.length < 2 || name.length > 140) throw new Error("Enter a product name between 2 and 140 characters.");
  if (brand.length > 100 || packSize.length > 60 || servingSize.length > 60) throw new Error("One or more product fields are too long.");
  if (allergensInput.length > 500) throw new Error("Allergen information must be 500 characters or fewer.");
  if (barcode && !/^\d{8,14}$/.test(barcode)) throw new Error("Enter an 8 to 14 digit GTIN/EAN barcode, or leave it blank.");
  if (!Object.values(ProductType).includes(productTypeInput as ProductType)) throw new Error("Choose a valid product type.");
  if (servingUnit && !servingUnits.includes(servingUnit as (typeof servingUnits)[number])) throw new Error("Choose a valid serving unit.");
  if ((servingQuantity === null) !== !servingUnit) throw new Error("Enter both a serving quantity and serving unit, or leave both blank.");

  const productType = productTypeInput as ProductType;
  const departmentInput = text(formData, "department") || text(formData, "category");
  const department = normaliseDepartment(departmentInput, productType, name);
  if (department && !supermarketDepartments.includes(department as (typeof supermarketDepartments)[number])) {
    throw new Error("Choose a valid supermarket department.");
  }

  if (barcode) {
    const conflict = await prisma.product.findFirst({
      where: { barcode, id: { not: productId } },
      select: { id: true },
    });
    if (conflict) throw new Error("That barcode is already linked to another product.");
  }

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { barcode: true, name: true, brand: true, packSize: true, productType: true },
  });
  if (!existing) throw new Error("Product not found.");

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      name,
      brand: nullable(brand),
      packSize: nullable(packSize),
      category: nullable(department),
      barcode: productType === ProductType.GENERIC_PRODUCE ? null : nullable(barcode),
      productType,
      servingSize: nullable(servingSize),
      servingQuantity,
      servingUnit: nullable(servingUnit),
      servingsPerPackage,
      allergens,
      lifecycle: "REVIEW_REQUIRED",
    },
    select: { id: true, slug: true },
  });

  const knowledgeChanged =
    existing.barcode !== (productType === ProductType.GENERIC_PRODUCE ? null : nullable(barcode))
    || existing.name !== name
    || existing.brand !== nullable(brand)
    || existing.packSize !== nullable(packSize)
    || existing.productType !== productType;

  if (knowledgeChanged) {
    await prisma.productEnrichmentJob.deleteMany({ where: { productId } });
    if (productType !== ProductType.GENERIC_PRODUCE) {
      await enrichProductKnowledge(productId);
    }
  }

  revalidatePath("/products");
  revalidatePath("/shopping");
  revalidatePath(`/products/${product.slug ?? product.id}`);
  redirect(`/products/${product.slug ?? product.id}`);
}
