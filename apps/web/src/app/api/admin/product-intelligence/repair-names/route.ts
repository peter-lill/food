import { NextResponse } from "next/server";
import { repairContaminatedProductNames } from "@/lib/product-intelligence/product-name-repair";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { limit?: unknown };
    const requested = typeof body.limit === "number" ? body.limit : 500;
    const limit = Math.max(1, Math.min(Math.floor(requested), 2000));
    const result = await repairContaminatedProductNames(limit);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
