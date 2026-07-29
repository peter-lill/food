import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findBestProductImage } from "@/lib/products/image-intelligence";
import { assessProductImage } from "@/lib/products/image-quality";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ productId: string }> };

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function noImageResponse() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-cache, max-age=60" },
  });
}

function redirectToImage(imageUrl: string) {
  const response = NextResponse.redirect(imageUrl, 307);
  response.headers.set("Cache-Control", "private, max-age=300");
  return response;
}

function localGenericImage(request: Request, product: { name: string; canonicalName: string | null; barcode: string | null }) {
  if (product.barcode) return null;
  const identity = normalise([product.name, product.canonicalName].filter(Boolean).join(" "));
  if (/\bmushrooms?\b/.test(identity)) return new URL("/product-images/button-mushroom.svg", request.url).toString();
  return null;
}

async function usableExistingImage(imageUrl: string | null) {
  if (!imageUrl) return null;
  const assessment = await assessProductImage(imageUrl);
  return assessment.reachable && assessment.score >= 45 ? imageUrl : null;
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new NextResponse(null, { status: 401 });

  const { productId } = await context.params;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, canonicalName: true, barcode: true, imageUrl: true },
  });
  if (!product) return noImageResponse();

  const localImage = localGenericImage(request, product);
  if (localImage) return redirectToImage(localImage);

  const existingImage = await usableExistingImage(product.imageUrl);
  if (existingImage) return redirectToImage(existingImage);

  const result = await findBestProductImage(product.id).catch((error) => {
    console.warn("Product image recovery failed", {
      productId: product.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (result?.imageUrl) {
    const assessment = await assessProductImage(result.imageUrl);
    if (assessment.reachable && assessment.score >= 45) return redirectToImage(result.imageUrl);
  }

  return noImageResponse();
}
