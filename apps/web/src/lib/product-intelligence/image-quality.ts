const requestTimeoutMs = 7_000;
const maximumImageBytes = 8 * 1024 * 1024;

export type ProductImageCandidate = {
  url: string;
  source: "current" | "manufacturer" | "retailer" | "open-food-facts" | "other";
  label?: string;
};

export type ProductImageAssessment = ProductImageCandidate & {
  valid: boolean;
  score: number;
  width: number | null;
  height: number | null;
  bytes: number | null;
  contentType: string | null;
  reasons: string[];
};

function cleanUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function readPngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24) return null;
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!png.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readGifDimensions(bytes: Uint8Array) {
  if (bytes.length < 10) return null;
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function readWebpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30) return null;
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff !== "RIFF" || webp !== "WEBP") return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X") {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { width, height };
  }
  return null;
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (length < 2) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

function imageDimensions(bytes: Uint8Array) {
  return readPngDimensions(bytes) ?? readJpegDimensions(bytes) ?? readWebpDimensions(bytes) ?? readGifDimensions(bytes);
}

function sourceScore(source: ProductImageCandidate["source"]) {
  switch (source) {
    case "retailer": return 32;
    case "manufacturer": return 26;
    case "open-food-facts": return 15;
    case "current": return 3;
    default: return 5;
  }
}

export async function assessProductImage(candidate: ProductImageCandidate): Promise<ProductImageAssessment> {
  const url = cleanUrl(candidate.url);
  const reasons: string[] = [];
  if (!url) return { ...candidate, valid: false, score: 0, width: null, height: null, bytes: null, contentType: null, reasons: ["Invalid URL"] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*", "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" },
    });
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLocaleLowerCase() ?? null;
    const declaredBytes = Number(response.headers.get("content-length"));
    if (!response.ok || !contentType?.startsWith("image/")) {
      return { ...candidate, valid: false, score: 0, width: null, height: null, bytes: Number.isFinite(declaredBytes) ? declaredBytes : null, contentType, reasons: [`HTTP ${response.status} or non-image response`] };
    }
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumImageBytes) {
      return { ...candidate, valid: false, score: 0, width: null, height: null, bytes: declaredBytes, contentType, reasons: ["Image is too large to assess safely"] };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maximumImageBytes) {
      return { ...candidate, valid: false, score: 0, width: null, height: null, bytes: buffer.byteLength, contentType, reasons: ["Image is too large to assess safely"] };
    }
    const dimensions = imageDimensions(new Uint8Array(buffer));
    const width = dimensions?.width ?? null;
    const height = dimensions?.height ?? null;
    let score = sourceScore(candidate.source);

    if (width && height) {
      const shortest = Math.min(width, height);
      const longest = Math.max(width, height);
      const ratio = longest / shortest;
      if (shortest >= 800) { score += 35; reasons.push("High resolution"); }
      else if (shortest >= 500) { score += 28; reasons.push("Good resolution"); }
      else if (shortest >= 300) { score += 18; reasons.push("Usable resolution"); }
      else if (shortest >= 160) { score += 5; reasons.push("Low resolution"); }
      else { score -= 25; reasons.push("Very low resolution"); }

      if (ratio <= 1.8) { score += 15; reasons.push("Balanced product framing"); }
      else if (ratio <= 2.8) { score += 7; reasons.push("Acceptable product framing"); }
      else { score -= 12; reasons.push("Extreme aspect ratio"); }
    } else {
      score -= 8;
      reasons.push("Dimensions unavailable");
    }

    if (buffer.byteLength >= 80_000) { score += 12; reasons.push("Detailed image file"); }
    else if (buffer.byteLength >= 25_000) score += 6;
    else if (buffer.byteLength < 8_000) { score -= 12; reasons.push("Very small image file"); }

    if (contentType === "image/png" || contentType === "image/webp" || contentType === "image/avif") score += 4;
    return { ...candidate, url, valid: true, score: Math.max(0, Math.round(score)), width, height, bytes: buffer.byteLength, contentType, reasons };
  } catch (error) {
    return { ...candidate, valid: false, score: 0, width: null, height: null, bytes: null, contentType: null, reasons: [error instanceof Error ? error.message : "Image request failed"] };
  } finally {
    clearTimeout(timer);
  }
}

export async function chooseBetterProductImage(
  candidates: ProductImageCandidate[],
  minimumImprovement = 8,
) {
  const unique = [...new Map(candidates.filter((candidate) => cleanUrl(candidate.url)).map((candidate) => [candidate.url, candidate])).values()];
  const assessments = await Promise.all(unique.map(assessProductImage));
  const valid = assessments.filter((assessment) => assessment.valid).sort((left, right) => right.score - left.score);
  const current = assessments.find((assessment) => assessment.source === "current") ?? null;
  const best = valid[0] ?? null;
  if (!best) return { selected: null, current, assessments, replaced: false };
  const replaced = best.source !== "current" && (!current?.valid || best.score >= current.score + minimumImprovement);
  return { selected: replaced || !current?.valid ? best : current, current, assessments, replaced };
}
