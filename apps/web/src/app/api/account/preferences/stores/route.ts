import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchColesStoreDirectory } from "@/lib/retailers/coles-store-directory";
import { isSupportedRetailer } from "@/lib/retailers/retailer-preferences";

type StoreCandidate = {
  retailer?: unknown;
  storeId?: unknown;
  name?: unknown;
  address?: unknown;
  postcode?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  distanceKm?: unknown;
  priceCatalogAvailable?: unknown;
};

function cleanText(value: unknown, max = 200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function coordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function queryCoordinate(value: string | null, minimum: number, maximum: number) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function mergeStoreCandidates(primary: StoreCandidate[], fallback: StoreCandidate[], limit: number) {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((store) => {
    const storeId = cleanText(store.storeId, 100);
    if (!storeId || seen.has(storeId)) return false;
    seen.add(storeId);
    return true;
  }).slice(0, limit);
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign in to find stores." }, { status: 401 });

  const retailer = request.nextUrl.searchParams.get("retailer") ?? "";
  if (!isSupportedRetailer(retailer)) {
    return NextResponse.json({ error: "Choose a supported retailer." }, { status: 400 });
  }

  const preference = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
    select: { homePostcode: true },
  });
  const latitudeParameter = request.nextUrl.searchParams.get("latitude");
  const longitudeParameter = request.nextUrl.searchParams.get("longitude");
  const latitude = queryCoordinate(latitudeParameter, -90, 90);
  const longitude = queryCoordinate(longitudeParameter, -180, 180);
  const requestedCurrentLocation = latitudeParameter !== null || longitudeParameter !== null;
  if (requestedCurrentLocation && (latitude === null || longitude === null)) {
    return NextResponse.json({ error: "Choose a valid current location." }, { status: 400 });
  }
  const postcode = (request.nextUrl.searchParams.get("postcode") || preference?.homePostcode || "").trim();
  if (!requestedCurrentLocation && !/^\d{4}$/.test(postcode)) {
    return NextResponse.json({ error: "Add a four-digit home postcode before finding stores." }, { status: 400 });
  }

  const localColesStores = retailer === "Coles" && !requestedCurrentLocation
    ? searchColesStoreDirectory(postcode, 10)
    : [];

  const baseUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!baseUrl) {
    if (localColesStores.length > 0) {
      return NextResponse.json({ stores: localColesStores, postcode, source: "local-coles-directory" });
    }
    return NextResponse.json({ error: "The retailer store service is not configured." }, { status: 503 });
  }
  const url = new URL("/stores", baseUrl);
  url.searchParams.set("retailer", retailer.toLowerCase());
  if (requestedCurrentLocation) {
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
  } else {
    url.searchParams.set("postcode", postcode);
  }
  url.searchParams.set("limit", "10");

  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const payload = await response.json().catch(() => ({})) as { stores?: StoreCandidate[]; error?: string };
    if (!response.ok) throw new Error(payload.error || `Store service returned HTTP ${response.status}.`);
    const stores = retailer === "Coles"
      ? mergeStoreCandidates(payload.stores ?? [], localColesStores, 10)
      : payload.stores ?? [];
    return NextResponse.json({ stores, postcode, source: "retailer-locator" });
  } catch (error) {
    console.error("Unable to find retailer stores", error);
    if (localColesStores.length > 0) {
      return NextResponse.json({ stores: localColesStores, postcode, source: "local-coles-directory" });
    }
    return NextResponse.json({ error: "Unable to find nearby stores right now." }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign in to save stores." }, { status: 401 });
  const body = await request.json().catch(() => null) as StoreCandidate | null;
  const retailer = cleanText(body?.retailer, 40);
  const storeId = cleanText(body?.storeId, 100);
  const name = cleanText(body?.name, 160);
  if (!isSupportedRetailer(retailer) || !storeId || !name) {
    return NextResponse.json({ error: "Choose a valid retailer store." }, { status: 400 });
  }

  const store = await prisma.preferredRetailerStore.upsert({
    where: { userId_retailer_storeId: { userId: session.user.id, retailer, storeId } },
    create: {
      userId: session.user.id, retailer, storeId, name,
      address: cleanText(body?.address) || null,
      postcode: cleanText(body?.postcode, 12) || null,
      latitude: coordinate(body?.latitude), longitude: coordinate(body?.longitude), isPreferred: true,
    },
    update: {
      name, address: cleanText(body?.address) || null, postcode: cleanText(body?.postcode, 12) || null,
      latitude: coordinate(body?.latitude), longitude: coordinate(body?.longitude), isPreferred: true,
    },
  });
  return NextResponse.json({ store });
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign in to remove stores." }, { status: 401 });
  const retailer = request.nextUrl.searchParams.get("retailer") ?? "";
  const storeId = request.nextUrl.searchParams.get("storeId") ?? "";
  if (!isSupportedRetailer(retailer) || !storeId) return NextResponse.json({ error: "Invalid store." }, { status: 400 });
  await prisma.preferredRetailerStore.deleteMany({ where: { userId: session.user.id, retailer, storeId } });
  return NextResponse.json({ removed: true });
}
