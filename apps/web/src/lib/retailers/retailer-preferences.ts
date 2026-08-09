import type { PreferredRetailerStore, RetailerPreference } from "@prisma/client";

export const supportedRetailers = [
  { id: "Coles", defaultEnabled: true },
  { id: "Woolworths", defaultEnabled: true },
] as const;

export type SupportedRetailer = (typeof supportedRetailers)[number]["id"];

export function isSupportedRetailer(value: string): value is SupportedRetailer {
  return supportedRetailers.some((retailer) => retailer.id === value);
}

export function enabledRetailers(
  preferences: Pick<RetailerPreference, "retailer" | "enabled">[],
): SupportedRetailer[] {
  const saved = new Map(preferences.map((preference) => [preference.retailer, preference.enabled]));
  return supportedRetailers
    .filter((retailer) => saved.get(retailer.id) ?? retailer.defaultEnabled)
    .map((retailer) => retailer.id);
}

export function missingStoreRetailers(
  enabled: readonly SupportedRetailer[],
  stores: Pick<PreferredRetailerStore, "retailer" | "isPreferred">[],
) {
  const configured = new Set(
    stores.filter((store) => store.isPreferred).map((store) => store.retailer),
  );
  return enabled.filter((retailer) => !configured.has(retailer));
}

export function preferredStoreIds(
  stores: Array<Pick<PreferredRetailerStore, "retailer" | "storeId" | "isPreferred">>,
) {
  const ids: Partial<Record<SupportedRetailer, string>> = {};
  for (const store of stores) {
    if (store.isPreferred && isSupportedRetailer(store.retailer) && !ids[store.retailer]) {
      ids[store.retailer] = store.storeId;
    }
  }
  return ids;
}

export function retailerNameMatches(preference: SupportedRetailer, retailerName: string) {
  const normalised = retailerName.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").trim();
  return preference === "Coles"
    ? normalised.includes("coles")
    : normalised.includes("woolworths");
}

export function retailerSetupStatus(input: {
  homePostcode: string | null | undefined;
  enabled: readonly SupportedRetailer[];
  stores: Pick<PreferredRetailerStore, "retailer" | "isPreferred">[];
}) {
  const missingStores = missingStoreRetailers(input.enabled, input.stores);
  return {
    ready: Boolean(input.homePostcode) && input.enabled.length > 0 && missingStores.length === 0,
    needsLocation: !input.homePostcode,
    needsRetailers: input.enabled.length === 0,
    missingStores,
  };
}
