"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { enrichProductKnowledge } from "@/lib/product-intelligence/barcode-enrichment";

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

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { imageUrl: null, lifecycle: "REVIEW_REQUIRED" },
    }),
    prisma.storeProduct.updateMany({
      where: { productId },
      data: { imageUrl: null },
    }),
  ]);

  revalidateProduct(productId, destination);
  redirect(destination);
}

export async function refreshProductImage(productId: string) {
  const destination = await productDestination(productId);

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { imageUrl: null, lifecycle: "REVIEW_REQUIRED" },
    }),
    prisma.storeProduct.updateMany({
      where: { productId },
      data: { imageUrl: null },
    }),
    prisma.productEnrichmentJob.deleteMany({ where: { productId } }),
  ]);

  await enrichProductKnowledge(productId);

  revalidateProduct(productId, destination);
  redirect(destination);
}
