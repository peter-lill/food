"use server";

import { ProductType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim();
}

function nullable(value: string) {
  return value || null;
}

function normaliseBarcode(value: string) {
  return value.replace(/\D/g, "");
}

export async function updateProductDetails(productId: string, formData: FormData) {
  const name = text(formData, "name");
  const brand = text(formData, "brand");
  const packSize = text(formData, "packSize");
  const category = text(formData, "category");
  const barcodeInput = text(formData, "barcode");
  const barcode = barcodeInput ? normaliseBarcode(barcodeInput) : "";
  const productTypeInput = text(formData, "productType");

  if (name.length < 2 || name.length > 140) throw new Error("Enter a product name between 2 and 140 characters.");
  if (brand.length > 100 || packSize.length > 60 || category.length > 100) throw new Error("One or more product fields are too long.");
  if (barcode && !/^\d{8,14}$/.test(barcode)) throw new Error("Enter an 8 to 14 digit GTIN/EAN barcode, or leave it blank.");
  if (!Object.values(ProductType).includes(productTypeInput as ProductType)) throw new Error("Choose a valid product type.");

  if (barcode) {
    const conflict = await prisma.product.findFirst({
      where: { barcode, id: { not: productId } },
      select: { id: true },
    });
    if (conflict) throw new Error("That barcode is already linked to another product.");
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      name,
      brand: nullable(brand),
      packSize: nullable(packSize),
      category: nullable(category),
      barcode: nullable(barcode),
      productType: productTypeInput as ProductType,
      lifecycle: "REVIEW_REQUIRED",
    },
    select: { id: true, slug: true },
  });

  await prisma.productEnrichmentJob.deleteMany({ where: { productId } });
  revalidatePath("/products");
  revalidatePath(`/products/${product.slug ?? product.id}`);
  redirect(`/products/${product.slug ?? product.id}`);
}
