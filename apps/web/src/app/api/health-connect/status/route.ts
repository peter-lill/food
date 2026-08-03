import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-session";
import { isHealthConnectPaired } from "@/lib/health/health-pairing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthSession();

  if (!session) {
    return NextResponse.json(
      { paired: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const paired = await isHealthConnectPaired(session.user.id);

  return NextResponse.json(
    { paired },
    { headers: { "Cache-Control": "no-store" } },
  );
}
