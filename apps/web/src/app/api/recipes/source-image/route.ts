import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const allowedHosts = new Set([
  "www.recipetineats.com",
  "recipetineats.com",
  "www.heartfoundation.org.au",
  "heartfoundation.org.au",
  "www.bhf.org.uk",
  "bhf.org.uk",
  "www.mayoclinic.org",
  "mayoclinic.org",
]);

function extractImageUrl(html: string, baseUrl: URL) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return new URL(match[1], baseUrl).toString();
  }

  return null;
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) return new NextResponse(null, { status: 400 });

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (sourceUrl.protocol !== "https:" || !allowedHosts.has(sourceUrl.hostname)) {
    return new NextResponse(null, { status: 403 });
  }

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Food recipe image resolver/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!response.ok) return new NextResponse(null, { status: 404 });

    const imageUrl = extractImageUrl(await response.text(), sourceUrl);
    if (!imageUrl) return new NextResponse(null, { status: 404 });

    return NextResponse.redirect(imageUrl, {
      status: 307,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
