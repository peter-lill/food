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

async function clearRejectedImage(productId: string) {
  await rejectCurrentProductImage(productId);
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
}

async function rejectAndSearch(productId: string) {
  await clearRejectedImage(productId);
  return findBestProductImage(productId);
}

export async function removeProductImage(productId: string) {
  const destination = await productDestination(productId);
  await rejectAndSearch(productId);
  revalidateProduct(productId, destination);
  redirect(destination);
}

export async function refreshProductImage(productId: string) {
  const destination = await productDestination(productId);
  const before = await prisma.product.findUnique({
    where: { id: productId },
    select: { imageUrl: true, lifecycle: true },
  });

  const result = await findBestProductImage(productId);

  if (!result.imageUrl && before?.imageUrl) {
    await prisma.product.update({
      where: { id: productId },
      data: { imageUrl: before.imageUrl, lifecycle: before.lifecycle },
    });
  }

  revalidateProduct(productId, destination);
  redirect(destination);
}

export async function restorePreviousProductImage(productId: string) {
  const destination = await productDestination(productId);
  const previous = await prisma.$queryRaw<Array<{ url: string }>>`
    SELECT "url"
    FROM "ProductImageCandidate"
    WHERE "productId" = ${productId}
      AND "rejected" = true
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;
  const url = previous[0]?.url ?? null;

  if (url) {
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "ProductImageCandidate"
        SET "rejected" = false,
            "selected" = ("url" = ${url}),
            "sourceLabel" = CASE WHEN "url" = ${url} THEN 'Restored by user' ELSE "sourceLabel" END,
            "updatedAt" = NOW()
        WHERE "productId" = ${productId}
      `,
      prisma.product.update({
        where: { id: productId },
        data: { imageUrl: url, lifecycle: "READY" },
      }),
    ]);
  }

  revalidateProduct(productId, destination);
  redirect(destination);
}
