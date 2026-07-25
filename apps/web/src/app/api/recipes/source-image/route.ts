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

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normaliseImageUrl(value: unknown, baseUrl: URL) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(decodeHtml(value.trim()), baseUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function imageFromJsonLd(value: unknown, baseUrl: URL): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = imageFromJsonLd(item, baseUrl);
      if (result) return result;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
  const isRecipe = types.some((type) => typeof type === "string" && type.toLowerCase() === "recipe");

  if (isRecipe) {
    const image = record.image;
    if (typeof image === "string") return normaliseImageUrl(image, baseUrl);
    if (Array.isArray(image)) {
      for (const candidate of image) {
        const result = typeof candidate === "string"
          ? normaliseImageUrl(candidate, baseUrl)
          : imageFromJsonLd(candidate, baseUrl);
        if (result) return result;
      }
    }
    if (image && typeof image === "object") {
      const imageRecord = image as Record<string, unknown>;
      const result = normaliseImageUrl(imageRecord.url ?? imageRecord.contentUrl, baseUrl);
      if (result) return result;
    }
  }

  for (const nested of Object.values(record)) {
    const result = imageFromJsonLd(nested, baseUrl);
    if (result) return result;
  }

  return null;
}

function extractImageUrl(html: string, baseUrl: URL) {
  const metaPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i,
  ];

  for (const pattern of metaPatterns) {
    const match = html.match(pattern);
    const result = normaliseImageUrl(match?.[1], baseUrl);
    if (result) return result;
  }

  const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLdPattern)) {
    try {
      const result = imageFromJsonLd(JSON.parse(match[1].trim()), baseUrl);
      if (result) return result;
    } catch {
      // Some sites include malformed JSON-LD; continue to the next candidate.
    }
  }

  const imagePatterns = [
    /<img[^>]+(?:data-lazy-src|data-src|data-original)=["']([^"']+)["']/i,
    /<img[^>]+srcset=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["']/i,
  ];

  for (const pattern of imagePatterns) {
    const match = html.match(pattern);
    const raw = match?.[1]?.split(",").at(-1)?.trim().split(/\s+/)[0];
    const result = normaliseImageUrl(raw, baseUrl);
    if (result && !/logo|icon|avatar|spinner|placeholder/i.test(result)) return result;
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
    const pageResponse = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FoodRecipeImageBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!pageResponse.ok) return new NextResponse(null, { status: 404 });

    const imageUrl = extractImageUrl(await pageResponse.text(), sourceUrl);
    if (!imageUrl) return new NextResponse(null, { status: 404 });

    const imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FoodRecipeImageBot/1.0)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: sourceUrl.toString(),
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    const contentType = imageResponse.headers.get("content-type") ?? "";
    if (!imageResponse.ok || !contentType.startsWith("image/")) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(imageResponse.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
