export type ReceiptCropRegion = { left: number; top: number; width: number; height: number };

export function receiptVisionCropRegions(width: number, height: number): ReceiptCropRegion[] {
  if (width < 1 || height < 1 || height < 1_600 || height / width < 1.6) return [];
  const cropHeight = Math.min(height, Math.ceil(height * 0.42));
  const lastTop = height - cropHeight;
  return [...new Set([0, Math.round(lastTop / 2), lastTop])]
    .map((top) => ({ left: 0, top, width, height: cropHeight }));
}

function dataUrl(buffer: Buffer) {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

export async function receiptVisionImageUrls(file: File): Promise<string[]> {
  const source = Buffer.from(await file.arrayBuffer());
  try {
    const sharp = (await import("sharp")).default;
    const normalised = await sharp(source, { limitInputPixels: 60_000_000 })
      .rotate()
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer({ resolveWithObject: true });
    const regions = receiptVisionCropRegions(normalised.info.width, normalised.info.height);
    const overview = await sharp(normalised.data)
      .resize({ width: 1_600, withoutEnlargement: true })
      .sharpen()
      .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
      .toBuffer();
    if (!regions.length) return [dataUrl(overview)];

    const tiles = await Promise.all(regions.map((region) => sharp(normalised.data)
      .extract(region)
      .resize({ width: 1_800, withoutEnlargement: false })
      .sharpen()
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer()));
    return [dataUrl(overview), ...tiles.map(dataUrl)];
  } catch (error) {
    console.warn("Unable to tile receipt image; using the original image", error);
    return [`data:${file.type};base64,${source.toString("base64")}`];
  }
}
