import { randomUUID } from "node:crypto";
import { importImageAssetBytes } from "@/lib/images/image-asset.service";
import { prisma } from "@/lib/prisma";
import { genericImageIdentity } from "@/lib/products/generic-image-policy";

const defaultModel = "gpt-image-2";

function promptFor(identity: string) {
  return `Professional grocery catalogue photograph of ${identity}. Show only the generic food ingredient, accurately and immediately recognisable, centred on a clean warm-white studio background. Soft natural shadow, even diffused lighting, realistic colour and texture, square composition, generous whitespace. No brand, packaging, label, text, logo, hands, people, utensils, tableware, decorative props, watermark, collage or multiple panels.`;
}

export async function generateGenericProductImage(productId: string, identity: string) {
  const safeIdentity = genericImageIdentity(identity);
  if (!safeIdentity) return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.FOOD_GENERIC_IMAGE_MODEL?.trim() || defaultModel;
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: promptFor(safeIdentity),
      n: 1,
      size: "1024x1024",
      quality: "medium",
      output_format: "webp",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`OpenAI image generation returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json() as { data?: Array<{ b64_json?: string }> };
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new Error("OpenAI image generation returned no image data");

  const asset = await importImageAssetBytes({
    bytes: Buffer.from(encoded, "base64"),
    mimeType: "image/webp",
    provider: model,
  });
  const candidateId = randomUUID();
  const candidateUrl = `generated://openai/${asset.sha256}`;

  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO "ProductImageCandidate" (
        "id", "productId", "url", "source", "sourceLabel", "score", "selected",
        "rejected", "assetId", "createdAt", "updatedAt"
      ) VALUES (
        ${candidateId}, ${productId}, ${candidateUrl}, 'OpenAI generated',
        ${`${model} · ${safeIdentity}`}, 100, true, false, ${asset.id}, NOW(), NOW()
      )
      ON CONFLICT ("productId", "url") DO UPDATE SET
        "selected" = true, "rejected" = false, "assetId" = EXCLUDED."assetId", "updatedAt" = NOW()
    `,
    prisma.$executeRaw`
      UPDATE "ProductImageCandidate"
      SET "selected" = false, "updatedAt" = NOW()
      WHERE "productId" = ${productId} AND "url" <> ${candidateUrl}
    `,
    prisma.$executeRaw`
      UPDATE "Product"
      SET "imageUrl" = ${candidateUrl}, "primaryImageAssetId" = ${asset.id},
          "lifecycle" = 'READY'::"ProductLifecycle", "confidenceScore" = 0.95,
          "updatedAt" = NOW()
      WHERE "id" = ${productId}
    `,
  ]);

  return { imageUrl: candidateUrl, assetId: asset.id, model };
}
