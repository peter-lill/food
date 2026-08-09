import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchGroceryProviders } from "@/lib/prices/providers/registry";
import { prisma } from "@/lib/prisma";
import { enabledRetailers, preferredStoreIds } from "@/lib/retailers/retailer-preferences";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ status: "error", error: "Sign in to search grocery providers." }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limitValue = Number(url.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(25, Math.trunc(limitValue))) : 10;

  if (query.length < 2) {
    return NextResponse.json({ status: "error", error: "Enter at least two characters." }, { status: 400 });
  }

  const [preferences, stores] = await Promise.all([
    prisma.retailerPreference.findMany({ where: { userId: session.user.id } }),
    prisma.preferredRetailerStore.findMany({ where: { userId: session.user.id, isPreferred: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  const retailers = enabledRetailers(preferences);
  const storeIds = preferredStoreIds(stores);
  const { results, errors } = await searchGroceryProviders(query, { limit, retailers, storeIds });
  return NextResponse.json({
    status: "success",
    query,
    results,
    errors,
    providerCount: results.length ? 1 : 0,
  }, { headers: { "Cache-Control": "no-store" } });
}
