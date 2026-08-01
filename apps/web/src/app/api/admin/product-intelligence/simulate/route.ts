import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { simulateCatalogueRepair } from "@/lib/grocery-intelligence/catalogue-simulation";

export const runtime = "nodejs";

function ownerEmails() {
  return new Set(
    (process.env.FOOD_OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLocaleLowerCase("en-AU"))
      .filter(Boolean),
  );
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user.email?.toLocaleLowerCase("en-AU");
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  if (!ownerEmails().has(email)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  try {
    const simulation = await simulateCatalogueRepair();
    return NextResponse.json({ ok: true, simulation });
  } catch (error) {
    console.error("Product Intelligence simulation failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Simulation failed" },
      { status: 500 },
    );
  }
}
