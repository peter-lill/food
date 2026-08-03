import { NextResponse } from "next/server";
import { runCatalogueLabelEnrichmentBatch } from "@/lib/product-intelligence/catalogue-label-enrichment";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { batchSize?: unknown };
    const requested = typeof body.batchSize === "number" ? body.batchSize : 20;
    const batchSize = Math.max(1, Math.min(Math.floor(requested), 50));
    const result = await runCatalogueLabelEnrichmentBatch(batchSize);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
