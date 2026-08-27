export type ReceiptVisionProviderKind = "openai" | "aicompute";

const transcriptionPrompt = "Transcribe this Australian supermarket receipt exactly, from top to bottom. The first image is the complete receipt; any following images are overlapping top-to-bottom close-ups of that same receipt. Use close-ups to read small print, but emit each physical row only once. Preserve every merchandise row, quantity row, promotion/discount, item-count total, tender, GST, date and footer as separate lines. Do not correct product names, infer missing products, calculate prices, or omit unreadable rows. Return JSON with lines (a string array) and confidence (a number from 0 to 100).";

export function receiptVisionRequest(kind: ReceiptVisionProviderKind, model: string, imageUrls: string[]) {
  if (kind === "aicompute") {
    return {
      endpoint: "chat/completions",
      body: {
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: transcriptionPrompt },
            ...imageUrls.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
          ],
        }],
        temperature: 0,
        max_tokens: 4_096,
        response_format: { type: "json_object" },
      },
    };
  }

  return {
    endpoint: "responses",
    body: {
      model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: transcriptionPrompt },
          ...imageUrls.map((image_url) => ({ type: "input_image", image_url, detail: "high" })),
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
    },
  };
}
