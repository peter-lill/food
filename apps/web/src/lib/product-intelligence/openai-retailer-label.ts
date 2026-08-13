import { configuredOpenAi } from "@/lib/ai/provider-settings";
import { validatedRetailerLabelText, type RetailerSearchResponse } from "./openai-retailer-response";

function productCode(url: string) {
  const parsed = new URL(url);
  return parsed.pathname.match(/-(\d{5,})\/?$/)?.[1]
    ?? parsed.pathname.match(/\/productdetails\/(\d{5,})\b/i)?.[1]
    ?? null;
}

export async function fetchOpenAiRetailerLabelSource(sourceUrl: string, retailer: string, fetcher: typeof fetch = fetch) {
  if (retailer !== "Coles" && retailer !== "Woolworths") return null;
  const provider = await configuredOpenAi();
  if (!provider) return null;
  const code = productCode(sourceUrl);
  if (!code) return null;
  const response = await fetcher(`${provider.baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.FOOD_RETAILER_WEB_MODEL?.trim() || "gpt-5.4-nano",
      tools: [{ type: "web_search", filters: { allowed_domains: [retailer === "Coles" ? "coles.com.au" : "woolworths.com.au"] }, search_context_size: "medium" }],
      input: `Open this exact ${retailer} product page and transcribe only its published label data: ${sourceUrl}\nReturn plain text headed Nutrition Information. Include servings per package, serving size, every nutrient with per-serving and per-100g/mL values, Ingredients, Contains, and May contain. Do not infer or calculate missing values.`,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) return null;
  return validatedRetailerLabelText(await response.json() as RetailerSearchResponse, sourceUrl);
}
