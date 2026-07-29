"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { rejectCurrentProductImage } from "@/lib/products/image-intelligence";
import { recoverProductImage } from "@/lib/products/image-recovery";

const imageSearchTimeoutMs = 25_000;

type ImageSearchStatus = {
  tone: "success" | "warning" | "error";
  message: string;
};

function imageSearchCookieName(productId: string) {
  return `food-image-search-${productId}`;
}

async function setImageSearchStatus(productId: string, status: ImageSearchStatus) {
  const cookieStore = await cookies();
  cookieStore.set(imageSearchCookieName(productId), JSON.stringify(status), {
    httpOnly: true,
    maxAge: 300,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

async function findBestProductImageWithTimeout(productId: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      recoverProductImage(productId),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("IMAGE_SEARCH_TIMEOUT")),
          imageSearchTimeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

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
  revalidatePath("/admin/image-intelligence");
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
  return findBestProductImageWithTimeout(productId);
}

export async function removeProductImage(productId: string) {
  const destination = await productDestination(productId);
  try {
    const result = await rejectAndSearch(productId);
    await setImageSearchStatus(productId, result.imageUrl
      ? { tone: "success", message: "The previous image was rejected and a replacement was selected." }
      : { tone: "warning", message: "The previous image was rejected, but no suitable replacement was found." });
  } catch (error) {
    await setImageSearchStatus(productId, {
      tone: "error",
      message: error instanceof Error && error.message === "IMAGE_SEARCH_TIMEOUT"
        ? "The replacement search timed out. The rejected image remains removed."
        : "The replacement search failed. Please try again.",
    });
  }
  revalidateProduct(productId, destination);
  redirect(destination);
}

export async function refreshProductImage(productId: string) {
  const destination = await productDestination(productId);
  const before = await prisma.product.findUnique({
    where: { id: productId },
    select: { imageUrl: true, lifecycle: true },
  });

  try {
    const result = await findBestProductImageWithTimeout(productId);

    if (!result.imageUrl && before?.imageUrl) {
      await prisma.product.update({
        where: { id: productId },
        data: { imageUrl: before.imageUrl, lifecycle: before.lifecycle },
      });
    }

    await setImageSearchStatus(productId, result.imageUrl
      ? { tone: "success", message: "Image search completed and the best available image was selected." }
      : { tone: "warning", message: "Image search completed, but no suitable image was found." });
  } catch (error) {
    if (before) {
      await prisma.product.update({
        where: { id: productId },
        data: { imageUrl: before.imageUrl, lifecycle: before.lifecycle },
      });
    }

    await setImageSearchStatus(productId, {
      tone: "error",
      message: error instanceof Error && error.message === "IMAGE_SEARCH_TIMEOUT"
        ? "Image search timed out after 25 seconds. The existing image was kept."
        : "Image search failed. The existing image was kept.",
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
    await setImageSearchStatus(productId, { tone: "success", message: "The previous product image was restored." });
  }

  revalidateProduct(productId, destination);
  redirect(destination);
}
