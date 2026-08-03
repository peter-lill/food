import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProductHubDetail } from "@/lib/products/product-hub.repository";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to view product intelligence." },
      { status: 401 },
    );
  }

  const { productId } = await context.params;
  const product = await getProductHubDetail(decodeURIComponent(productId));

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  return NextResponse.json({ product });
}
