"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { importImageAsset } from "@/lib/images/image-asset.service";
import { prisma } from "@/lib/prisma";
import { resolveRetailerProductReference } from "@/lib/prices/coles-woolworths-provider";
import {
  recordCandidateAssessment,
  recordDiscoveredCandidate,
} from "@/lib/products/image-candidate.repository";
import { assessProductImage } from "@/lib/products/image-quality";
import { isRetailerBrandImageUrl } from "@/lib/products/retailer-brand-image";

const imagePanelAnchor = "#image-intelligence";

function candidateAnchor(candidateId: string) {
  return `#image-candidate-${encodeURIComponent(candidateId)}`;
}

function imageSearchCookieName(productId: string) {
  return `food-image-search-${productId}`;
}

function isRedirectError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "digest" in error
    && typeof (error as { digest?: unknown }).digest === "string"
    && (error as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}

async function setStatus(productId: string, tone: "success" | "warning" | "error", message: string) {
  const cookieStore = await cookies();
  cookieStore.set(imageSearchCookieName(productId), JSON.stringify({ tone, message }), {
    httpOnly: true,
    maxAge: 300,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

async function destinationFor(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true },
  });
  if (!product) throw new Error("Product not found.");
  return `/products/${product.slug ?? product.id}`;
}

function revalidateProduct(productId: string, destination: string) {
  revalidatePath("/products");
  revalidatePath(destination);
  revalidatePath(`/api/products/${encodeURIComponent(productId)}/image`);
  revalidatePath("/admin/product-intelligence");
  revalidatePath("/admin/image-intelligence");
}

export async function resolveDirectRetailerImage(productId: string, formData: FormData) {
  const destination = await destinationFor(productId);
  const reference = String(formData.get("retailerReference") ?? "").trim();

  if (!reference) {
    await setStatus(productId, "warning", "Paste a Coles or Woolworths product link or product ID first.");
    redirect(`${destination}${imagePanelAnchor}`);
  }

  try {
    const candidate = await resolveRetailerProductReference(reference);
    if (!candidate?.imageUrl || !candidate.externalId) {
      await setStatus(productId, "warning", "Food could not resolve an exact retailer image from that reference.");
      revalidateProduct(productId, destination);
      redirect(`${destination}${imagePanelAnchor}`);
    }

    const assessment = await assessProductImage(candidate.imageUrl, { referer: candidate.sourceUrl });
    const retailerBrandAsset = isRetailerBrandImageUrl(candidate.imageUrl);
    // Coles currently serves some exact product photos in formats whose
    // dimensions cannot be read by our lightweight scorer.  For a direct,
    // exact retailer match, a reachable, non-trivial image remains stronger
    // evidence than that parser limitation.
    const exactRetailerImage = assessment.reachable
      && Boolean(assessment.contentType?.startsWith("image/"))
      && (assessment.contentLength ?? 0) >= 12_000;
    const accepted = !retailerBrandAsset
      && assessment.reachable
      && Boolean(assessment.contentType?.startsWith("image/"))
      && (assessment.score >= 35 || exactRetailerImage);

    const candidateId = await recordDiscoveredCandidate(productId, {
      url: candidate.imageUrl,
      source: `${candidate.retailer.toLocaleLowerCase("en-AU")}-direct`,
      sourceLabel: `${candidate.retailer} · ${candidate.productName}`,
      identityScore: 100,
      providerScore: 98,
    });

    const overallScore = Math.round((assessment.score * 0.45) + (100 * 0.4) + (98 * 0.15));
    const rejectionReasons = accepted ? [] : retailerBrandAsset
      ? ["Retailer brand logo is not a product image"]
      : assessment.issues.length ? assessment.issues : ["Image did not pass validation"];

    await recordCandidateAssessment({
      candidateId,
      assessment,
      accepted,
      rejectionReasons,
      overallScore,
    });

    // Keep a local asset while the successful request still has the retailer
    // product-page referer. Candidate-gallery previews later cannot rely on a
    // second anonymous CDN request (the cause of the broken Coles thumbnail).
    if (accepted) {
      try {
        const asset = await importImageAsset({
          url: candidate.imageUrl,
          provider: `${candidate.retailer.toLocaleLowerCase("en-AU")}-direct`,
          referer: candidate.sourceUrl,
        });
        await prisma.$executeRaw`
          UPDATE "ProductImageCandidate"
          SET "assetId" = ${asset.id}, "updatedAt" = NOW()
          WHERE "id" = ${candidateId} AND "productId" = ${productId}
        `;
      } catch (error) {
        await recordCandidateAssessment({
          candidateId,
          assessment,
          accepted: false,
          rejectionReasons: [error instanceof Error ? error.message : "Exact retailer image could not be stored"],
          overallScore,
        });
        await setStatus(productId, "warning", `The exact ${candidate.retailer} product was found, but Food could not store its image.`);
        revalidateProduct(productId, destination);
        redirect(`${destination}${candidateAnchor(candidateId)}`);
      }
    }

    if (!accepted) {
      await setStatus(productId, "warning", `The exact ${candidate.retailer} product was found, but its image did not pass validation. It remains in the Candidate Gallery for review.`);
      revalidateProduct(productId, destination);
      redirect(`${destination}${candidateAnchor(candidateId)}`);
    }

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
            "updatedAt" = NOW()
        WHERE "productId" = ${productId} AND "id" = ${candidateId}
      `,
      prisma.product.update({
        where: { id: productId },
        data: {
          imageUrl: candidate.imageUrl,
          lifecycle: "READY",
          confidenceScore: 0.98,
        },
      }),
    ]);

    await setStatus(productId, "success", `Exact ${candidate.retailer} product ${candidate.externalId} was resolved and made primary.`);
    revalidateProduct(productId, destination);
    redirect(`${destination}?image=${encodeURIComponent(candidateId)}${candidateAnchor(candidateId)}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    await setStatus(productId, "error", "The retailer reference could not be resolved. Check the Coles or Woolworths link or product ID and try again.");
    revalidateProduct(productId, destination);
    redirect(`${destination}${imagePanelAnchor}`);
  }
}
