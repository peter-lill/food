type OpenAiResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  output_text?: string;
};

export type ReceiptVisionResult = { text: string; confidence: number };

export function parseReceiptVisionOutput(payload: OpenAiResponse): ReceiptVisionResult | null {
  const responsesText = payload.output_text ?? (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("\n");
  const output = responsesText || payload.choices?.[0]?.message?.content || "";
  if (!output.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;

  const value = parsed as { lines?: unknown; confidence?: unknown };
  if (!Array.isArray(value.lines)) return null;
  const lines = value.lines
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 250);
  if (lines.length < 3 || lines.join("\n").length > 30_000) return null;

  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence)
    ? Math.max(0, Math.min(100, value.confidence))
    : 75;
  return { text: lines.join("\n"), confidence };
}
