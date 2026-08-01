import { NextResponse } from "next/server";
import { ProductLifecycle } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { identifyGrocery } from "@/lib/grocery-intelligence/identity";
import { CanonicalProductService } from "@/lib/product-intelligence/CanonicalProductService";
import { normaliseProductIdentity } from "@/lib/product-intelligence/ProductResolver";

export const runtime = "nodejs";

type ApplyRequest = {
  action?: "RENAME" | "MERGE";
  productId?: string;
  targetProductId?: string | null;
  suggestedName?: string;
};

function ownerEmails() {
  return new Set(
    (process.env.FOOD_OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLocaleLowerCase("en-AU"))
      .filter(Boolean),
  );
}

async function attachAlias(productId: string, alias: string, source: string) {
  const cleanAlias = alias.replace(/\s+/g, " ").trim();
  const normalised = normaliseProductIdentity(cleanAlias);
  if (!cleanAlias || !normalised) return;
  await prisma.productAlias.upsert({
    where: { normalised },
    create: { productId, alias: cleanAlias, normalised, source },
    update: { productId, alias: cleanAlias, source },
  });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user.email?.toLocaleLowerCase("en-AU");
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  if (!ownerEmails().has(email)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json() as ApplyRequest;
    if (!body.productId || !body.action) {
      return NextResponse.json({ ok: false, error: "Product and action are required" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || product.lifecycle === ProductLifecycle.ARCHIVED) {
      return NextResponse.json({ ok: false, error: "Active product not found" }, { status: 404 });
    }

    if (body.action === "MERGE") {
      if (!body.targetProductId) {
        return NextResponse.json({ ok: false, error: "Merge target is required" }, { status: 400 });
      }
      const targetId = await CanonicalProductService.merge(body.targetProductId, body.productId);
      return NextResponse.json({ ok: true, action: "MERGE", productId: targetId });
    }

    const identity = identifyGrocery(body.suggestedName ?? product.canonicalName ?? product.name);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "Suggested name is not a valid grocery identity" }, { status: 400 });
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.product.update({
        where: { id: product.id },
        data: {
          name: identity.canonicalName,
          canonicalName: identity.canonicalName,
          lifecycle: ProductLifecycle.MATCHED,
          confidenceScore: Math.max(product.confidenceScore, identity.confidence),
        },
      });
    });

    await attachAlias(product.id, product.name, "grocery-intelligence-approved");
    await attachAlias(product.id, identity.canonicalName, "canonical-name");

    return NextResponse.json({ ok: true, action: "RENAME", productId: product.id, canonicalName: identity.canonicalName });
  } catch (error) {
    console.error("Product Intelligence repair failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Repair failed" },
      { status: 500 },
    );
  }
}
