import { fetchRemoteImage } from "@/lib/images/remote-image";

export type ProductImageAssessment = {
  url: string;
  reachable: boolean;
  contentType: string | null;
  contentLength: number | null;
  width: number | null;
  height: number | null;
  score: number;
  issues: string[];
};

const timeoutMs = 15_000;
const minimumDimension = 320;
const preferredDimension = 700;

function uint16BE(buffer: Uint8Array, offset: number) {
  return (buffer[offset] << 8) | buffer[offset + 1];
}

function uint32BE(buffer: Uint8Array, offset: number) {
  return ((buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]) >>> 0;
}

function pngDimensions(buffer: Uint8Array) {
  if (buffer.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => buffer[index] === value)) return null;
  return { width: uint32BE(buffer, 16), height: uint32BE(buffer, 20) };
}

function gifDimensions(buffer: Uint8Array) {
  if (buffer.length < 10) return null;
  const header = String.fromCharCode(...buffer.slice(0, 6));
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  return {
    width: buffer[6] | (buffer[7] << 8),
    height: buffer[8] | (buffer[9] << 8),
  };
}

function jpegDimensions(buffer: Uint8Array) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = uint16BE(buffer, offset + 2);
    if (length < 2 || offset + length + 2 > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: uint16BE(buffer, offset + 5),
        width: uint16BE(buffer, offset + 7),
      };
    }
    offset += length + 2;
  }
  return null;
}

function dimensions(buffer: Uint8Array, contentType: string | null) {
  if (contentType?.includes("png")) return pngDimensions(buffer);
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return jpegDimensions(buffer);
  if (contentType?.includes("gif")) return gifDimensions(buffer);
  return pngDimensions(buffer) ?? jpegDimensions(buffer) ?? gifDimensions(buffer);
}

function qualityScore(input: {
  reachable: boolean;
  contentType: string | null;
  contentLength: number | null;
  width: number | null;
  height: number | null;
}) {
  const issues: string[] = [];
  if (!input.reachable) return { score: 0, issues: ["Image could not be downloaded"] };
  if (!input.contentType?.startsWith("image/")) issues.push("Response is not an image");
  if (input.contentLength !== null && input.contentLength < 12_000) issues.push("Image file is unusually small");
  if (input.width !== null && input.height !== null) {
    const shortest = Math.min(input.width, input.height);
    if (shortest < minimumDimension) issues.push("Image resolution is too low");
    const ratio = Math.max(input.width, input.height) / Math.max(1, shortest);
    if (ratio > 3.2) issues.push("Image is excessively wide or tall");
  } else {
    issues.push("Image dimensions could not be verified");
  }

  let score = 45;
  if (input.contentType?.startsWith("image/")) score += 15;
  if (input.contentLength !== null && input.contentLength >= 30_000) score += 10;
  if (input.width !== null && input.height !== null) {
    const shortest = Math.min(input.width, input.height);
    score += shortest >= preferredDimension ? 25 : shortest >= minimumDimension ? 15 : 0;
    const ratio = Math.max(input.width, input.height) / Math.max(1, shortest);
    if (ratio <= 1.6) score += 5;
  }
  score -= issues.length * 12;
  return { score: Math.max(0, Math.min(100, score)), issues };
}

export async function assessProductImage(
  url: string,
  options: { referer?: string | null } = {},
): Promise<ProductImageAssessment> {
  try {
    const downloaded = await fetchRemoteImage(url, timeoutMs, options);
    const contentType = downloaded.mimeType;
    const bytes = new Uint8Array(downloaded.bytes);
    const size = dimensions(bytes, contentType);
    const contentLength = downloaded.declaredContentLength ?? bytes.byteLength;
    const result = qualityScore({ reachable: true, contentType, contentLength, width: size?.width ?? null, height: size?.height ?? null });
    return {
      url,
      reachable: true,
      contentType,
      contentLength,
      width: size?.width ?? null,
      height: size?.height ?? null,
      score: result.score,
      issues: result.issues,
    };
  } catch (error) {
    return {
      url,
      reachable: false,
      contentType: null,
      contentLength: null,
      width: null,
      height: null,
      score: 0,
      issues: [error instanceof Error ? error.message : "Image assessment failed"],
    };
  }
}
