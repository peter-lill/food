import { NextResponse } from "next/server";
import { getAuthSession, isOwnerEmail } from "@/lib/auth-session";
import { recogniseReceiptWithVision } from "@/lib/receipts/receipt-vision";

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
    return NextResponse.json(result);
  } catch (error) {
    console.warn("Optional server receipt recognition failed", error);
    return NextResponse.json({ error: "Server receipt recognition failed." }, { status: 502 });
  }
}
