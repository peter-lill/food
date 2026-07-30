"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveWoolworthsProductReference } from "@/lib/prices/coles-woolworths-provider";
import {
  recordCandidateAssessment,
  recordDiscoveredCandidate,
} from "@/lib/products/image-candidate.repository";
import { assessProductImage } from "@/lib/products/image-quality";

function imageSearchCookieName(productId: string) {
  return `food-image-search-${productId}`;
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
    await setStatus(productId, "warning", "Paste a Woolworths product link or product ID first.");
    redirect(destination);
  }

  try {
    const candidate = await resolveWoolworthsProductReference(reference);
    if (!candidate?.imageUrl || !candidate.externalId) {
      await setStatus(productId, "warning", "Food could not resolve an exact Woolworths image from that reference.");
      revalidateProduct(productId, destination);
      redirect(destination);
    }

    const assessment = await assessProductImage(candidate.imageUrl);
    const accepted = assessment.reachable
      && Boolean(assessment.contentType?.startsWith("image/"))
      && assessment.score >= 35;

    const candidateId = await recordDiscoveredCandidate(productId, {
      url: candidate.imageUrl,
      source: "woolworths-direct",
      sourceLabel: `Woolworths · ${candidate.productName}`,
      identityScore: 100,
      providerScore: 98,
    });

    const overallScore = Math.round((assessment.score * 0.45) + (100 * 0.4) + (98 * 0.15));
    const rejectionReasons = accepted ? [] : assessment.issues.length ? assessment.issues : ["Image did not pass validation"];

    await recordCandidateAssessment({
      candidateId,
      assessment,
      accepted,
      rejectionReasons,
      overallScore,
    });

    if (!accepted) {
      await setStatus(productId, "warning", "The exact Woolworths product was found, but its image did not pass validation. It remains in the Candidate Gallery for review.");
      revalidateProduct(productId, destination);
      redirect(destination);
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

    await setStatus(productId, "success", `Exact Woolworths product ${candidate.externalId} was resolved and made primary.`);
    revalidateProduct(productId, destination);
    redirect(`${destination}?image=${encodeURIComponent(candidateId)}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    await setStatus(productId, "error", "The Woolworths reference could not be resolved. Check the link or product ID and try again.");
    revalidateProduct(productId, destination);
    redirect(destination);
  }
}
