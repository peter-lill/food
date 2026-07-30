import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/owner-access";

function isProductImageRequest(pathname: string) {
  return /^\/api\/products\/[^/]+\/image(?:\/|$)/.test(pathname)
    || /^\/api\/products\/[^/]+\/image-candidates\/[^/]+(?:\/|$)/.test(pathname);
}

export async function proxy(request: NextRequest) {
  // Image elements must receive an image response (or a normal HTTP error),
  // never an HTML redirect to the sign-in page. The route handlers retain
  // their own session checks.
  if (isProductImageRequest(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set(
      "callbackURL",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  if (!isOwnerEmail(session.user.email)) {
    return NextResponse.redirect(new URL("/recipes", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/planner/:path*",
    "/pantry/:path*",
    "/scan/:path*",
    "/receipts/:path*",
    "/prices/:path*",
    "/shopping/:path*",
    "/health/:path*",
    "/inventory/:path*",
    "/api/products/:path*",
    "/api/prices/:path*",
    "/api/health/latest",
  ],
};