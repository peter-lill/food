import { colesProductLabelSourceFromData } from "./coles-label-page";

type BridgePayload = { status?: string; results?: Array<{ productId?: unknown; raw?: unknown }> };

function productCode(sourceUrl: string) {
  try { return new URL(sourceUrl).pathname.match(/-(\d{5,})\/?$/)?.[1] ?? null; } catch { return null; }
}

export async function fetchColesApiLabelSource(sourceUrl: string) {
  const baseUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  const code = productCode(sourceUrl);
  if (!baseUrl || !code) return null;
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", code);
  url.searchParams.set("retailer", "coles");
  url.searchParams.set("limit", "10");
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return null;
  const payload = await response.json() as BridgePayload;
  if (payload.status !== "success") return null;
  const exact = payload.results?.find((item) => String(item.productId ?? "").replace(/\D/g, "") === code);
  return exact ? colesProductLabelSourceFromData(exact.raw) : null;
}
