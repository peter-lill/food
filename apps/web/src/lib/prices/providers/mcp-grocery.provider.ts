import type {
  GroceryProvider,
  GroceryProviderResult,
  GroceryProviderSearchOptions,
} from "./types";

type BridgeResponse = {
  status: "success" | "error";
  results?: Array<{
    retailer?: unknown;
    name?: unknown;
    price?: unknown;
    packSize?: unknown;
    unit?: unknown;
    store?: unknown;
    barcode?: unknown;
    imageUrl?: unknown;
    productId?: unknown;
    wasPrice?: unknown;
    isSpecial?: unknown;
    promotion?: unknown;
    productUrl?: unknown;
    storeSpecific?: unknown;
  }>;
  errors?: unknown;
  error?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolean(value: unknown) {
  return value === true;
}

function money(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function bridgeErrors(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export class McpGroceryProvider implements GroceryProvider {
  readonly id = "coles-woolworths-mcp";

  enabled() {
    return Boolean(process.env.GROCERY_MCP_BRIDGE_URL?.trim());
  }

  async search(query: string, options: GroceryProviderSearchOptions = {}): Promise<GroceryProviderResult[]> {
    const baseUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
    if (!baseUrl) return [];

    const requestedRetailers: Array<"Coles" | "Woolworths" | "ALDI" | "Drakes" | null> = options.retailers ?? [null];
    const searches = requestedRetailers.map(async (retailer) => {
      const url = new URL("/search", baseUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", String(Math.max(1, Math.min(25, options.limit ?? 10))));
      if (retailer) url.searchParams.set("retailer", retailer.toLowerCase());
      const storeId = retailer ? options.storeIds?.[retailer] : options.storeId;
      if (storeId) url.searchParams.set("storeId", storeId);

      const controller = new AbortController();
      const timeoutMs = Math.max(15_000, Number(process.env.GROCERY_MCP_TIMEOUT_MS ?? 30_000));
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({})) as BridgeResponse;
        if (!response.ok || payload.status !== "success") {
          throw new Error(text(payload.error) ?? `Grocery MCP bridge returned HTTP ${response.status}.`);
        }

        const errors = bridgeErrors(payload.errors);
        if (errors.length) {
          console.warn("Grocery MCP bridge returned retailer errors", { query, errors });
        }

        return (payload.results ?? []).flatMap((item): GroceryProviderResult[] => {
          const resultRetailer = text(item.retailer);
          const name = text(item.name);
          if ((resultRetailer !== "Coles" && resultRetailer !== "Woolworths" && resultRetailer !== "ALDI" && resultRetailer !== "Drakes") || !name) return [];
          return [{
            retailer: resultRetailer,
            name,
            price: money(item.price),
            packSize: text(item.packSize),
            unit: text(item.unit),
            store: text(item.store),
            barcode: text(item.barcode),
            imageUrl: text(item.imageUrl),
            productId: text(item.productId),
            wasPrice: money(item.wasPrice),
            isSpecial: boolean(item.isSpecial),
            promotion: text(item.promotion),
            productUrl: text(item.productUrl),
            storeSpecific: boolean(item.storeSpecific),
            source: this.id,
          }];
        });
      } finally {
        clearTimeout(timer);
      }
    });
    return (await Promise.all(searches)).flat();
  }
}

