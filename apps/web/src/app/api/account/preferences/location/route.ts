import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type LocationRequest = {
  homeLocation?: unknown;
  homePostcode?: unknown;
  lockToHomeLocation?: unknown;
};

export async function PUT(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in to save a home location." }, { status: 401 });
  }

  let body: LocationRequest;
  try {
    body = await request.json() as LocationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid location request." }, { status: 400 });
  }

  const homeLocation =
    typeof body.homeLocation === "string"
      ? body.homeLocation.replace(/\s+/g, " ").trim()
      : "";
  const homePostcode =
    typeof body.homePostcode === "string"
      ? body.homePostcode.replace(/\s+/g, " ").trim()
      : "";

  if (homeLocation.length < 2 || homeLocation.length > 120) {
    return NextResponse.json(
      { error: "Enter a suburb, city or region between 2 and 120 characters." },
      { status: 400 },
    );
  }
  if (homePostcode.length > 12 || !/^[a-zA-Z0-9 -]*$/.test(homePostcode)) {
    return NextResponse.json({ error: "Enter a valid postcode." }, { status: 400 });
  }

  await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      homeLocation,
      homePostcode: homePostcode || null,
      lockToHomeLocation: body.lockToHomeLocation === true,
    },
    update: {
      homeLocation,
      homePostcode: homePostcode || null,
      lockToHomeLocation: body.lockToHomeLocation === true,
    },
  });

  return NextResponse.json({ saved: true });
}
