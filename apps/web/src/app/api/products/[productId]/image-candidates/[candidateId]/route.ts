import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProductImageCandidate } from "@/lib/products/image-candidate.repository";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ productId: string; candidateId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new NextResponse(null, { status: 401 });

  const { productId, candidateId } = await context.params;
  const candidate = await getProductImageCandidate(productId, candidateId);
  if (!candidate) return new NextResponse(null, { status: 404 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(candidate.url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        "User-Agent": "FoodImageIntelligence/1.0 (+https://food.coffeehq.coffee)",
      },
    });
    if (!response.ok) return new NextResponse(null, { status: 404 });
    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return new NextResponse(null, { status: 415 });
    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  } finally {
    clearTimeout(timeout);
  }
}
