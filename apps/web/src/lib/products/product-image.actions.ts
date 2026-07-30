"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { rejectCurrentProductImage } from "@/lib/products/image-intelligence";
import { recoverProductImage, type ImageSearchDiagnostics } from "@/lib/products/image-recovery";
import {
  getProductImageCandidate,
  rejectProductImageCandidate,
  restoreProductImageCandidate,
} from "@/lib/products/image-candidate.repository";

const imageSearchTimeoutMs = 25_000;
const imagePanelAnchor = "#image-intelligence";

function candidateAnchor(candidateId: string) {
  return `#image-candidate-${encodeURIComponent(candidateId)}`;
}

type ImageSearchStatus = {
  tone: "success" | "warning" | "error";
  message: string;
  diagnostics?: ImageSearchDiagnostics;
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
        timeout = setTimeout(() => reject(new Error("IMAGE_SEARCH_TIMEOUT")), imageSearchTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function productDestination(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, slug: true } });
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
    prisma.product.update({ where: { id: productId }, data: { imageUrl: null, lifecycle: "REVIEW_REQUIRED" } }),
    prisma.storeProduct.updateMany({ where: { productId }, data: { imageUrl: null } }),
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
      ? { tone: "success", message: "The previous image was rejected and a replacement was selected.", diagnostics: result.diagnostics }
      : { tone: "warning", message: "The previous image was rejected, but no suitable replacement was found.", diagnostics: result.diagnostics });
  } catch (error) {
    await setImageSearchStatus(productId, {
      tone: "error",
      message: error instanceof Error && error.message === "IMAGE_SEARCH_TIMEOUT"
        ? "The replacement search timed out. The rejected image remains removed."
        : "The replacement search failed. Please try again.",
    });
  }
  revalidateProduct(productId, destination);
  redirect(`${destination}${imagePanelAnchor}`);
}

export async function refreshProductImage(productId: string) {
  const destination = await productDestination(productId);
  const before = await prisma.product.findUnique({ where: { id: productId }, select: { imageUrl: true, lifecycle: true } });

  try {
    const result = await findBestProductImageWithTimeout(productId);

    if (!result.imageUrl && before?.imageUrl) {
      await prisma.product.update({ where: { id: productId }, data: { imageUrl: before.imageUrl, lifecycle: before.lifecycle } });
    }

    await setImageSearchStatus(productId, result.imageUrl
      ? { tone: "success", message: "Image search completed and the best available image was selected.", diagnostics: result.diagnostics }
      : { tone: "warning", message: "Image search completed, but no suitable image was found.", diagnostics: result.diagnostics });
  } catch (error) {
    if (before) {
      await prisma.product.update({ where: { id: productId }, data: { imageUrl: before.imageUrl, lifecycle: before.lifecycle } });
    }

    await setImageSearchStatus(productId, {
      tone: "error",
      message: error instanceof Error && error.message === "IMAGE_SEARCH_TIMEOUT"
        ? "Image search timed out after 25 seconds. The existing image was kept."
        : "Image search failed. The existing image was kept.",
    });
  }

  revalidateProduct(productId, destination);
  redirect(`${destination}${imagePanelAnchor}`);
}

export async function selectProductImageCandidate(productId: string, candidateId: string) {
  const destination = await productDestination(productId);
  const candidate = await getProductImageCandidate(productId, candidateId);
  if (!candidate) throw new Error("Image candidate not found.");

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "ProductImageCandidate"
      SET "selected" = false, "updatedAt" = NOW()
      WHERE "productId" = ${productId}
    `,
    prisma.$executeRaw`
      UPDATE "ProductImageCandidate"
      SET "selected" = true,
          "accepted" = true,
          "rejected" = false,
          "rejectionReasons" = array_remove("rejectionReasons", 'Rejected by user'),
          "updatedAt" = NOW()
      WHERE "productId" = ${productId} AND "id" = ${candidateId}
    `,
    prisma.product.update({
      where: { id: productId },
      data: { imageUrl: candidate.url, lifecycle: "READY", updatedAt: new Date() },
    }),
  ]);

  await setImageSearchStatus(productId, { tone: "success", message: "The selected candidate is now the primary product image." });
  revalidateProduct(productId, destination);
  redirect(`${destination}?image=${encodeURIComponent(candidateId)}${candidateAnchor(candidateId)}`);
}

export async function rejectGalleryImageCandidate(productId: string, candidateId: string) {
  const destination = await productDestination(productId);
  const candidate = await getProductImageCandidate(productId, candidateId);
  if (!candidate) throw new Error("Image candidate not found.");

  await rejectProductImageCandidate(productId, candidateId);
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { imageUrl: true } });
  if (product?.imageUrl === candidate.url) {
    await prisma.product.update({ where: { id: productId }, data: { imageUrl: null, lifecycle: "REVIEW_REQUIRED" } });
  }
  await setImageSearchStatus(productId, { tone: "warning", message: "The candidate was rejected and will not be selected automatically." });
  revalidateProduct(productId, destination);
  redirect(`${destination}${imagePanelAnchor}`);
}

export async function restoreGalleryImageCandidate(productId: string, candidateId: string) {
  const destination = await productDestination(productId);
  const candidate = await getProductImageCandidate(productId, candidateId);
  if (!candidate) throw new Error("Image candidate not found.");

  await restoreProductImageCandidate(productId, candidateId);
  await setImageSearchStatus(productId, {
    tone: "success",
    message: "The image was restored to the candidate gallery and can be selected again.",
  });
  revalidateProduct(productId, destination);
  redirect(`${destination}${candidateAnchor(candidateId)}`);
}

export async function restorePreviousProductImage(productId: string) {
  const destination = await productDestination(productId);
  const previous = await prisma.$queryRaw<Array<{ url: string }>>`
    SELECT "url" FROM "ProductImageCandidate"
    WHERE "productId" = ${productId} AND "rejected" = true
    ORDER BY "updatedAt" DESC LIMIT 1
  `;
  const url = previous[0]?.url ?? null;

  if (url) {
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "ProductImageCandidate"
        SET "rejected" = false,
            "selected" = ("url" = ${url}),
            "sourceLabel" = CASE WHEN "url" = ${url} THEN 'Restored by user' ELSE "sourceLabel" END,
            "rejectionReasons" = array_remove("rejectionReasons", 'Rejected by user'),
            "updatedAt" = NOW()
        WHERE "productId" = ${productId}
      `,
      prisma.product.update({ where: { id: productId }, data: { imageUrl: url, lifecycle: "READY" } }),
    ]);
    await setImageSearchStatus(productId, { tone: "success", message: "The previous product image was restored." });
  }

  revalidateProduct(productId, destination);
  redirect(`${destination}${imagePanelAnchor}`);
}
