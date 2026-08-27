import { configuredOpenAi } from "@/lib/ai/provider-settings";
import { parseReceiptVisionOutput, type ReceiptVisionResult } from "./receipt-vision-output";

type OpenAiResponse = Parameters<typeof parseReceiptVisionOutput>[0];

export async function recogniseReceiptWithVision(file: File, fetcher: typeof fetch = fetch): Promise<ReceiptVisionResult | null> {
  const provider = await configuredOpenAi();
  if (!provider) return null;
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 15 * 1024 * 1024) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const imageUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  const response = await fetcher(`${provider.baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.FOOD_RECEIPT_OCR_MODEL?.trim() || "gpt-5.4-mini",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Transcribe this Australian supermarket receipt exactly, from top to bottom. Preserve every merchandise row, quantity row, promotion/discount, item-count total, tender, GST, date and footer as separate lines. Do not correct product names, infer missing products, calculate prices, or omit unreadable rows. Use an empty string only for an entirely unreadable line. Return JSON matching the schema." },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "receipt_transcription",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              lines: { type: "array", items: { type: "string" } },
              confidence: { type: "number", minimum: 0, maximum: 100 },
            },
            required: ["lines", "confidence"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Receipt vision returned ${response.status}.`);
  return parseReceiptVisionOutput(await response.json() as OpenAiResponse);
}
