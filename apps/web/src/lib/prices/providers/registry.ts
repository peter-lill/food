import { McpGroceryProvider } from "./mcp-grocery.provider";
import type { GroceryProvider, GroceryProviderResult, GroceryProviderSearchOptions } from "./types";

const providers: GroceryProvider[] = [
  new McpGroceryProvider(),
];

export function enabledGroceryProviders() {
  return providers.filter((provider) => provider.enabled());
}

export async function searchGroceryProviders(
  query: string,
  options: GroceryProviderSearchOptions = {},
): Promise<{ results: GroceryProviderResult[]; errors: string[] }> {
  const active = enabledGroceryProviders();
  const settled = await Promise.allSettled(active.map((provider) => provider.search(query, options)));
  const results: GroceryProviderResult[] = [];
  const errors: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") results.push(...result.value);
    else errors.push(`${active[index]?.id ?? "provider"}: ${result.reason instanceof Error ? result.reason.message : "search failed"}`);
  });

  return { results, errors };
}
