import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CanonicalProductService } from "@/lib/product-intelligence/CanonicalProductService";

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
    const result = await CanonicalProductService.consolidateGenericProduce();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Canonical product consolidation failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Product consolidation failed",
      },
      { status: 500 },
    );
  }
}
