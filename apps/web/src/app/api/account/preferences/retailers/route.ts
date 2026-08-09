import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSupportedRetailer } from "@/lib/retailers/retailer-preferences";

type RetailerRequest = { retailer?: unknown; enabled?: unknown };

export async function PUT(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in to update retailer preferences." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as RetailerRequest | null;
  if (!body || typeof body.retailer !== "string" || !isSupportedRetailer(body.retailer) || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Choose a supported retailer and enabled state." }, { status: 400 });
  }

  const preference = await prisma.retailerPreference.upsert({
    where: { userId_retailer: { userId: session.user.id, retailer: body.retailer } },
    create: { userId: session.user.id, retailer: body.retailer, enabled: body.enabled },
    update: { enabled: body.enabled },
    select: { retailer: true, enabled: true },
  });
  return NextResponse.json({ preference });
}
