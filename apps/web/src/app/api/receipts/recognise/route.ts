import { NextResponse } from "next/server";
import { getAuthSession, isOwnerEmail } from "@/lib/auth-session";
import { recogniseReceiptWithVision } from "@/lib/receipts/receipt-vision";
import { parseReceipt } from "@/lib/receipts/engine/parser";
import { receiptLineCandidatesFromOcr, receiptLinesText } from "@/lib/receipts/receipt-structure";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session || !isOwnerEmail(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("receipt");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A receipt image is required." }, { status: 400 });
    }
    const result = await recogniseReceiptWithVision(file);
    if (!result) {
      return NextResponse.json({ error: "Server receipt recognition is unavailable." }, { status: 503 });
    }
    const lines = receiptLineCandidatesFromOcr(undefined, result.text)[0] ?? [];
    const parsed = parseReceipt(receiptLinesText(lines), lines);
    console.info("Receipt vision structural summary", {
      transcriptionLines: result.text.split(/\r?\n/).filter(Boolean).length,
      retailer: parsed.retailer,
      hasDate: Boolean(parsed.purchasedAt),
      total: parsed.total,
      productLines: parsed.items.length,
      units: parsed.items.reduce((sum, item) => sum + item.quantity, 0),
      warningCount: parsed.warnings.length,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.warn("Optional server receipt recognition failed", error);
    return NextResponse.json({ error: "Server receipt recognition failed." }, { status: 502 });
  }
}
