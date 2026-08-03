import { NextResponse } from "next/server";
import { getAuthSession, isOwnerEmail } from "@/lib/auth-session";
import { queueProductNameRepairSuggestions } from "@/lib/product-intelligence/product-repair-workflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session || !isOwnerEmail(session.user.email)) {
      return NextResponse.json({ error: "Owner access required." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { limit?: unknown };
    const requested = typeof body.limit === "number" ? body.limit : 500;
    const limit = Math.max(1, Math.min(Math.floor(requested), 2000));
    const result = await queueProductNameRepairSuggestions(limit, session.user.email);

    return NextResponse.json({
      ...result,
      mode: "preview-and-queue",
      message: "No canonical product names were changed. Review suggestions in Admin → Repair Queue.",
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
