import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recoverProductImage } from "@/lib/products/image-recovery";
import { assessProductImage } from "@/lib/products/image-quality";
import { isGenericFoodImageEligible } from "@/lib/products/generic-image-policy";
import {
  ensureProductPrimaryAsset,
  getProductPrimaryImageAsset,
  makeCandidatePrimaryAsset,
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

async function localAssetResponse(productId: string, allowGenericImage: boolean, currentImageUrl?: string | null) {
  const selectedCandidates = await prisma.$queryRaw<Array<{ id: string; source: string; url: string }>>`
    SELECT "id", "source", "url"
    FROM "ProductImageCandidate"
    WHERE "productId" = ${productId}
      AND "selected" = true
      AND "rejected" = false
      AND (${allowGenericImage} OR ("source" <> 'OpenAI generated' AND "url" NOT LIKE 'generated://%'))
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;

  const selectedCandidateId = selectedCandidates[0]?.id ?? null;
  const asset = selectedCandidateId
    ? await makeCandidatePrimaryAsset(productId, selectedCandidateId).catch((error) => {
        console.warn("Selected product image asset reconciliation failed", {
          productId,
          candidateId: selectedCandidateId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
    : (!allowGenericImage && currentImageUrl?.startsWith("generated://"))
      ? null
      : await getProductPrimaryImageAsset(productId)
        ?? await ensureProductPrimaryAsset(productId).catch((error) => {
        console.warn("Primary image asset import failed", {
          productId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });

  if (!asset) return null;

  const body = await readImageAsset(asset).catch((error) => {
    console.warn("Primary image asset read failed", {
      productId,
      assetId: asset.id,
      storagePath: asset.storagePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (!body) return null;

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
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

export async function GET(_request: Request, context: RouteContext) {
  const { productId } = await context.params;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      imageUrl: true,
      brand: true,
      barcode: true,
      category: true,
      productType: true,
      storeProducts: {
        where: { imageUrl: { not: null }, active: true },
        orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
        select: { imageUrl: true },
      },
    },
  });
  if (!product) return noImageResponse();
  const allowGenericImage = isGenericFoodImageEligible(product);
  const stored = await localAssetResponse(productId, allowGenericImage, product.imageUrl);
  if (stored) return stored;
  const genericFamily = allowGenericImage;

  if (genericFamily) {
    const familyName = product.canonicalName ?? product.name;
    const familyProducts = await prisma.product.findMany({
      where: {
        id: { not: product.id },
        lifecycle: { not: "ARCHIVED" },
        brand: null,
        barcode: null,
        OR: [
          { canonicalName: { equals: familyName, mode: "insensitive" } },
          { name: { equals: familyName, mode: "insensitive" } },
          ...(product.canonicalName
            ? [{ canonicalName: { equals: product.canonicalName, mode: "insensitive" as const } }]
            : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true },
    });

    for (const familyProduct of familyProducts) {
      const familyAsset = await localAssetResponse(familyProduct.id, true);
      if (familyAsset) return familyAsset;
    }
  }

  const imageOptions = [
    ...(!allowGenericImage && product.imageUrl?.startsWith("generated://") ? [] : [product.imageUrl]),
    ...(genericFamily ? [] : product.storeProducts.map((listing) => listing.imageUrl)),
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
    const imported = await localAssetResponse(product.id, allowGenericImage, result.imageUrl);
    if (imported) return imported;
    const proxied = await proxyImage(result.imageUrl);
    if (proxied) return proxied;
  }

  return noImageResponse();
}
