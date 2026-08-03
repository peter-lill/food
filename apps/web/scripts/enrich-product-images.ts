import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const defaultLimit = 40;
const requestTimeoutMs = 15_000;
const batchSize = 2;

function requestedLimit() {
  const argument = process.argv.find((value) => value.startsWith("--limit="));
  const value = argument ? Number(argument.split("=", 2)[1]) : defaultLimit;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : defaultLimit;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function imageCandidate(result: Record<string, unknown>) {
  const values = [
    result.thumbnail,
    result.image,
    result.original,
    result.serpapi_thumbnail,
    ...(Array.isArray(result.thumbnails) ? result.thumbnails : []),
  ];

  for (const value of values) {
    const candidate = cleanText(value);
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const normalised = url.toString();
      if (!/^https?:$/.test(url.protocol)) continue;
      if (/logo|icon|placeholder|sprite|avatar/i.test(normalised)) continue;
      return normalised;
    } catch {
      // Ignore malformed image values.
    }
  }

  return null;
}

async function searchProductImage(query: string, apiKey: string) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", `${query} grocery Australia`);
  url.searchParams.set("gl", "au");
  url.searchParams.set("hl", "en");
  url.searchParams.set("api_key", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json() as {
      shopping_results?: unknown;
      inline_shopping_results?: unknown;
      error?: unknown;
    };

    if (!response.ok) {
      const detail = cleanText(payload.error);
      throw new Error(`SerpApi returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const results = [
      ...(Array.isArray(payload.shopping_results) ? payload.shopping_results : []),
      ...(Array.isArray(payload.inline_shopping_results) ? payload.inline_shopping_results : []),
    ].filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));

    for (const result of results) {
      const imageUrl = imageCandidate(result);
      if (imageUrl) return imageUrl;
    }

    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is required to enrich product images.");
  }

  const limit = requestedLimit();
  const products = await prisma.product.findMany({
    where: {
      imageUrl: null,
    },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
    },
    orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
    take: limit,
  });

  console.log(`Enriching images for ${products.length} products...`);
  let updated = 0;
  let missing = 0;
  let failed = 0;

  for (let index = 0; index < products.length; index += batchSize) {
    const batch = products.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map(async (product) => {
        const displayName = product.canonicalName ?? product.name;
        const query = [product.brand, displayName].filter(Boolean).join(" ");

        try {
          const imageUrl = await searchProductImage(query, apiKey);
          if (!imageUrl) {
            return { product, status: "missing" as const };
          }

          await prisma.product.update({
            where: { id: product.id },
            data: { imageUrl },
          });

          return { product, status: "updated" as const };
        } catch (error) {
          return {
            product,
            status: "failed" as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    for (const result of results) {
      const position = products.findIndex((product) => product.id === result.product.id) + 1;
      if (result.status === "updated") {
        updated += 1;
        console.log(`[${position}/${products.length}] ${result.product.name} -> image saved`);
      } else if (result.status === "missing") {
        missing += 1;
        console.log(`[${position}/${products.length}] ${result.product.name} -> no image found`);
      } else {
        failed += 1;
        console.error(`[${position}/${products.length}] ${result.product.name} -> ${result.error}`);
      }
    }
  }

  console.table({ total: products.length, updated, missing, failed });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
