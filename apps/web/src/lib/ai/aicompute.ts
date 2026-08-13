export type AiComputeConfig = { apiKey: string; baseUrl: string; model: string };

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

export async function aiComputeChat(config: AiComputeConfig, messages: Array<{ role: "system" | "user"; content: string }>, fetcher: typeof fetch = fetch) {
  const response = await fetcher(endpoint(config.baseUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.1, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`AI Compute returned ${response.status}.`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI Compute returned no content.");
  return content;
}

export async function testAiComputeConnection(config: AiComputeConfig, fetcher: typeof fetch = fetch) {
  await aiComputeChat(config, [
    { role: "system", content: "Return JSON only." },
    { role: "user", content: 'Return exactly {"ok":true}.' },
  ], fetcher);
}
