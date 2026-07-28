"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findBestProductImage, rejectCurrentProductImage } from "@/lib/products/image-intelligence";

async function productDestination(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true },
  });
  if (!product) throw new Error("Product not found.");
  return `/products/${product.slug ?? product.id}`;
}

function revalidateProduct(productId: string, destination: string) {
  revalidatePath("/products");
  revalidatePath("/admin/product-intelligence");
  revalidatePath(destination);
  revalidatePath(`/api/products/${encodeURIComponent(productId)}/image`);
}

export async function removeProductImage(productId: string) {
  const destination = await productDestination(productId);
  await rejectCurrentProductImage(productId);
  await prisma.product.update({
    where: { id: productId },
    data: { imageUrl: null, lifecycle: "REVIEW_REQUIRED" },
  });
  revalidateProduct(productId, destination);
  redirect(destination);
}

export async function refreshProductImage(productId: string) {
  const destination = await productDestination(productId);
  await rejectCurrentProductImage(productId);
  await prisma.product.update({
    where: { id: productId },
    data: { imageUrl: null, lifecycle: "REVIEW_REQUIRED" },
  });
  await findBestProductImage(productId);
  revalidateProduct(productId, destination);
  redirect(destination);
}
