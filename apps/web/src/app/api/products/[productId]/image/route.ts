import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recoverProductImage } from "@/lib/products/image-recovery";
import { assessProductImage } from "@/lib/products/image-quality";
import {
  ensureProductPrimaryAsset,
  getProductPrimaryImageAsset,
  readImageAsset,
} from "@/lib/images/image-asset.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ productId: string }> };

function noImageResponse() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

async function localAssetResponse(productId: string) {
  const asset = await getProductPrimaryImageAsset(productId)
    ?? await ensureProductPrimaryAsset(productId).catch((error) => {
      console.warn("Primary image asset import failed", {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
  if (!asset) return null;

  const body = await readImageAsset(asset).catch(() => null);
  if (!body) return null;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      ETag: `"${asset.sha256}"`,
    },
  });
}

async function proxyImage(imageUrl: string) {
  const response = await fetch(imageUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "Food/0.1 (https://food.coffeehq.coffee; product image proxy)",
    },
  }).catch(() => null);

  if (!response?.ok) return null;
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!contentType.startsWith("image/")) return null;

  const body = await response.arrayBuffer();
  if (!body.byteLength) return null;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function usableExistingImage(imageUrl: string | null) {
  if (!imageUrl) return null;
  const assessment = await assessProductImage(imageUrl).catch(() => null);
  return assessment?.reachable && assessment.contentType?.startsWith("image/") && assessment.score >= 35
    ? imageUrl
    : null;
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new NextResponse(null, { status: 401 });

  const { productId } = await context.params;
  const stored = await localAssetResponse(productId);
  if (stored) return stored;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      imageUrl: true,
      storeProducts: {
        where: { imageUrl: { not: null }, active: true },
        orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
        select: { imageUrl: true },
      },
    },
  });
  if (!product) return noImageResponse();

  const imageOptions = [
    product.imageUrl,
    ...product.storeProducts.map((listing) => listing.imageUrl),
  ].filter((value): value is string => Boolean(value));

  for (const imageUrl of imageOptions) {
    const existingImage = await usableExistingImage(imageUrl);
    if (!existingImage) continue;
    const proxied = await proxyImage(existingImage);
    if (proxied) return proxied;
  }

  const result = await recoverProductImage(product.id).catch((error) => {
    console.warn("Product image recovery failed", {
      productId: product.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (result?.imageUrl) {
    const imported = await localAssetResponse(product.id);
    if (imported) return imported;
    const proxied = await proxyImage(result.imageUrl);
    if (proxied) return proxied;
  }

  return noImageResponse();
}
