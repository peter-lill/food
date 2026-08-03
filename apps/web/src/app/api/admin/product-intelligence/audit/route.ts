import { NextResponse } from "next/server";
import { getCatalogueLabelAudit } from "@/lib/product-intelligence/catalogue-label-enrichment";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const audit = await getCatalogueLabelAudit(1000);
    return NextResponse.json(audit, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
