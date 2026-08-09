import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type LocationRequest = {
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

  const homePostcode =
    typeof body.homePostcode === "string"
      ? body.homePostcode.replace(/\s+/g, " ").trim()
      : "";

  if (!/^\d{4}$/.test(homePostcode)) {
    return NextResponse.json({ error: "Enter a four-digit Australian postcode." }, { status: 400 });
  }

  await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      homeLocation: null,
      homePostcode,
      lockToHomeLocation: body.lockToHomeLocation === true,
    },
    update: {
      homeLocation: null,
      homePostcode,
      lockToHomeLocation: body.lockToHomeLocation === true,
    },
  });

  return NextResponse.json({ saved: true });
}
