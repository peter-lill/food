import { configuredOpenAi, configuredProvider } from "@/lib/ai/provider-settings";
import { parseReceiptVisionOutput, type ReceiptVisionResult } from "./receipt-vision-output";
import { receiptVisionRequest, type ReceiptVisionProviderKind } from "./receipt-vision-request";

type OpenAiResponse = Parameters<typeof parseReceiptVisionOutput>[0];
type ReceiptVisionProvider = { apiKey: string; baseUrl: string; model: string; kind: ReceiptVisionProviderKind };

async function configuredReceiptVisionProvider(): Promise<ReceiptVisionProvider | null> {
  const openai = await configuredOpenAi();
  if (openai) return { ...openai, kind: "openai" };
  const aicompute = await configuredProvider("aicompute");
  return aicompute ? { ...aicompute, kind: "aicompute" } : null;
}

export async function recogniseReceiptWithVision(file: File, fetcher: typeof fetch = fetch): Promise<ReceiptVisionResult | null> {
  const provider = await configuredReceiptVisionProvider();
  if (!provider) return null;
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 15 * 1024 * 1024) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const imageUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  const model = provider.kind === "openai"
    ? process.env.FOOD_RECEIPT_OCR_MODEL?.trim() || "gpt-5.4-mini"
    : provider.model;
  const request = receiptVisionRequest(provider.kind, model, imageUrl);
  const response = await fetcher(`${provider.baseUrl.replace(/\/$/, "")}/${request.endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${provider.kind} receipt vision returned ${response.status}.`);
  return parseReceiptVisionOutput(await response.json() as OpenAiResponse);
}
