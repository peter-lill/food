import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

export type ImageAssetRecord = {
  id: string;
  sha256: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  storagePath: string;
  originalUrl: string | null;
  provider: string | null;
};

const browserHeaders = {
  "Accept-Language": "en-AU,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

function storageRoot() {
  return process.env.FOOD_IMAGE_STORAGE_DIR?.trim()
    || path.join(process.cwd(), "storage", "product-images");
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("avif")) return "avif";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

function woolworthsStockcode(url: string) {
  try {
    const parsed = new URL(url);
    if (!/(?:^|\.)woolworths\.media$/i.test(parsed.hostname)) return null;
    return parsed.pathname.match(/\/(\d{4,12})(?:_\d+)?\.(?:jpe?g|png|webp)$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function sessionCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [];
  const combined = response.headers.get("set-cookie");
  if (!values.length && combined) values.push(combined);
  return values
    .map((cookie) => cookie.split(";", 1)[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join("; ");
}

async function fetchRemoteImage(url: string) {
  const stockcode = woolworthsStockcode(url);
  let cookie = "";
  let referer = "";

  if (stockcode) {
    referer = `https://www.woolworths.com.au/shop/productdetails/${stockcode}`;
    const bootstrap = await fetch(referer, {
      cache: "no-store",
      redirect: "follow",
      headers: { ...browserHeaders, Accept: "text/html,application/xhtml+xml" },
    }).catch(() => null);
    if (bootstrap) cookie = sessionCookies(bootstrap);
  }

  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      ...browserHeaders,
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      ...(referer ? { Referer: referer } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });

  if (!response.ok) throw new Error(`Image returned HTTP ${response.status}`);
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mimeType.startsWith("image/")) throw new Error("Remote response was not an image");

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Remote image was empty");
  return { bytes, mimeType };
}

async function writeAssetBytes(asset: ImageAssetRecord, bytes: Buffer) {
  const absolutePath = path.join(storageRoot(), asset.storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);
  return bytes;
}

export async function importImageAsset(input: {
  url: string;
  provider?: string | null;
}) {
  const { bytes, mimeType } = await fetchRemoteImage(input.url);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const existing = await prisma.$queryRaw<ImageAssetRecord[]>`
    SELECT "id", "sha256", "mimeType", "fileSizeBytes", "width", "height",
           "storagePath", "originalUrl", "provider"
    FROM "ImageAsset"
    WHERE "sha256" = ${sha256}
    LIMIT 1
  `;
  if (existing[0]) {
    await writeAssetBytes(existing[0], bytes).catch(() => undefined);
    return existing[0];
  }

  const id = randomUUID();
  const extension = extensionForMime(mimeType);
  const relativePath = path.join(sha256.slice(0, 2), `${sha256}.${extension}`);
  const absolutePath = path.join(storageRoot(), relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });

  const rows = await prisma.$queryRaw<ImageAssetRecord[]>`
    INSERT INTO "ImageAsset" (
      "id", "sha256", "mimeType", "fileSizeBytes", "storagePath",
      "originalUrl", "provider", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${sha256}, ${mimeType}, ${bytes.length}, ${relativePath},
      ${input.url}, ${input.provider ?? null}, NOW(), NOW()
    )
    ON CONFLICT ("sha256") DO UPDATE SET
      "originalUrl" = COALESCE("ImageAsset"."originalUrl", EXCLUDED."originalUrl"),
      "provider" = COALESCE("ImageAsset"."provider", EXCLUDED."provider"),
      "updatedAt" = NOW()
    RETURNING "id", "sha256", "mimeType", "fileSizeBytes", "width", "height",
              "storagePath", "originalUrl", "provider"
  `;
  return rows[0];
}

export async function importCandidateAsset(productId: string, candidateId: string) {
  const candidates = await prisma.$queryRaw<Array<{ id: string; url: string; source: string; assetId: string | null }>>`
    SELECT "id", "url", "source", "assetId"
    FROM "ProductImageCandidate"
    WHERE "productId" = ${productId} AND "id" = ${candidateId}
    LIMIT 1
  `;
  const candidate = candidates[0];
  if (!candidate) throw new Error("Image candidate not found");

  if (candidate.assetId) {
    const existing = await getImageAsset(candidate.assetId);
    if (existing) return existing;
  }

  const asset = await importImageAsset({ url: candidate.url, provider: candidate.source });
  await prisma.$executeRaw`
    UPDATE "ProductImageCandidate"
    SET "assetId" = ${asset.id}, "updatedAt" = NOW()
    WHERE "id" = ${candidateId} AND "productId" = ${productId}
  `;
  return asset;
}

export async function ensureProductPrimaryAsset(productId: string) {
  const current = await getProductPrimaryImageAsset(productId);
  if (current) return current;

  const selected = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "ProductImageCandidate"
    WHERE "productId" = ${productId} AND "selected" = true AND "rejected" = false
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;
  const candidateId = selected[0]?.id;
  if (!candidateId) return null;

  const asset = await importCandidateAsset(productId, candidateId);
  await prisma.$executeRaw`
    UPDATE "Product"
    SET "primaryImageAssetId" = ${asset.id}, "updatedAt" = NOW()
    WHERE "id" = ${productId}
  `;
  return asset;
}

export async function makeCandidatePrimaryAsset(productId: string, candidateId: string) {
  const asset = await importCandidateAsset(productId, candidateId);
  await prisma.$executeRaw`
    UPDATE "Product"
    SET "primaryImageAssetId" = ${asset.id}, "updatedAt" = NOW()
    WHERE "id" = ${productId}
  `;
  return asset;
}

export async function getImageAsset(assetId: string) {
  const rows = await prisma.$queryRaw<ImageAssetRecord[]>`
    SELECT "id", "sha256", "mimeType", "fileSizeBytes", "width", "height",
           "storagePath", "originalUrl", "provider"
    FROM "ImageAsset"
    WHERE "id" = ${assetId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getProductPrimaryImageAsset(productId: string) {
  const rows = await prisma.$queryRaw<ImageAssetRecord[]>`
    SELECT a."id", a."sha256", a."mimeType", a."fileSizeBytes", a."width", a."height",
           a."storagePath", a."originalUrl", a."provider"
    FROM "Product" p
    JOIN "ImageAsset" a ON a."id" = p."primaryImageAssetId"
    WHERE p."id" = ${productId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getCandidateImageAsset(productId: string, candidateId: string) {
  const rows = await prisma.$queryRaw<ImageAssetRecord[]>`
    SELECT a."id", a."sha256", a."mimeType", a."fileSizeBytes", a."width", a."height",
           a."storagePath", a."originalUrl", a."provider"
    FROM "ProductImageCandidate" c
    JOIN "ImageAsset" a ON a."id" = c."assetId"
    WHERE c."productId" = ${productId} AND c."id" = ${candidateId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function readImageAsset(asset: ImageAssetRecord) {
  const absolutePath = path.join(storageRoot(), asset.storagePath);
  try {
    return await readFile(absolutePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" || !asset.originalUrl) throw error;

    const restored = await fetchRemoteImage(asset.originalUrl);
    const restoredHash = createHash("sha256").update(restored.bytes).digest("hex");
    if (restoredHash !== asset.sha256) {
      throw new Error("Restored image no longer matches the recorded asset");
    }
    return writeAssetBytes(asset, restored.bytes);
  }
}
