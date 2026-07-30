import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getCandidateImageAsset,
  importCandidateAsset,
  readImageAsset,
} from "@/lib/images/image-asset.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ productId: string; candidateId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new NextResponse(null, { status: 401 });

  const { productId, candidateId } = await context.params;
  const asset = await getCandidateImageAsset(productId, candidateId)
    ?? await importCandidateAsset(productId, candidateId).catch((error) => {
      console.warn("Candidate image import failed", {
        productId,
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

  if (!asset) return new NextResponse(null, { status: 404 });

  const body = await readImageAsset(asset).catch(() => null);
  if (!body) return new NextResponse(null, { status: 404 });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      ETag: `"${asset.sha256}"`,
    },
  });
}
