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

function isGenericImage(url: string, sourceUrl: URL) {
  const value = url.toLowerCase();
  const commonBranding = /logo|icon|avatar|spinner|placeholder|social-share|default[-_]?image|brandmark/;
  if (commonBranding.test(value)) return true;

  if (sourceUrl.hostname.includes("mayoclinic.org")) {
    return /mayo[-_ ]?clinic|mc-logo|social-media|sharing-image|open-graph-default/.test(value);
  }

  return false;
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
    const candidates: unknown[] = Array.isArray(image) ? image : [image];

    for (const candidate of candidates) {
      let result: string | null = null;
      if (typeof candidate === "string") {
        result = normaliseImageUrl(candidate, baseUrl);
      } else if (candidate && typeof candidate === "object") {
        const imageRecord = candidate as Record<string, unknown>;
        result = normaliseImageUrl(imageRecord.url ?? imageRecord.contentUrl, baseUrl);
      }
      if (result && !isGenericImage(result, baseUrl)) return result;
    }
  }

  for (const nested of Object.values(record)) {
    const result = imageFromJsonLd(nested, baseUrl);
    if (result) return result;
  }

  return null;
}

function extractImageUrl(html: string, baseUrl: URL) {
  // Recipe schema is the most reliable source of the actual dish photo.
  const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLdPattern)) {
    try {
      const result = imageFromJsonLd(JSON.parse(match[1].trim()), baseUrl);
      if (result) return result;
    } catch {
      // Continue when a source publishes malformed JSON-LD.
    }
  }

  const metaPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i,
  ];

  for (const pattern of metaPatterns) {
    const result = normaliseImageUrl(html.match(pattern)?.[1], baseUrl);
    if (result && !isGenericImage(result, baseUrl)) return result;
  }

  const imagePatterns = [
    /<img[^>]+(?:data-lazy-src|data-src|data-original)=["']([^"']+)["']/gi,
    /<img[^>]+srcset=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
  ];

  for (const pattern of imagePatterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1]?.split(",").at(-1)?.trim().split(/\s+/)[0];
      const result = normaliseImageUrl(raw, baseUrl);
      if (result && !isGenericImage(result, baseUrl)) return result;
    }
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
      cache: "no-store",
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
      cache: "no-store",
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
