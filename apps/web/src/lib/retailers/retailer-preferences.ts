import type { PreferredRetailerStore, RetailerPreference } from "@prisma/client";

export const supportedRetailers = [
  { id: "Coles", defaultEnabled: true, requiresStore: true },
  { id: "Woolworths", defaultEnabled: true, requiresStore: true },
  { id: "ALDI", defaultEnabled: false, requiresStore: false },
  { id: "Drakes", defaultEnabled: false, requiresStore: true },
] as const;

export type SupportedRetailer = (typeof supportedRetailers)[number]["id"];

export function isSupportedRetailer(value: string): value is SupportedRetailer {
  return supportedRetailers.some((retailer) => retailer.id === value);
}

export function retailerRequiresStore(retailer: SupportedRetailer) {
  return supportedRetailers.find((candidate) => candidate.id === retailer)?.requiresStore ?? false;
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
  return enabled.filter((retailer) => retailerRequiresStore(retailer) && !configured.has(retailer));
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
  if (preference === "Coles") return normalised.includes("coles");
  if (preference === "Woolworths") return normalised.includes("woolworths");
  if (preference === "ALDI") return normalised.includes("aldi");
  return normalised.includes("drakes");
}

export function retailerSetupStatus(input: {
  homePostcode: string | null | undefined;
  enabled: readonly SupportedRetailer[];
  stores: Pick<PreferredRetailerStore, "retailer" | "isPreferred">[];
}) {
  const missingStores = missingStoreRetailers(input.enabled, input.stores);
  const needsLocation = input.enabled.some(retailerRequiresStore) && !input.homePostcode;
  return {
    ready: !needsLocation && input.enabled.length > 0 && missingStores.length === 0,
    needsLocation,
    needsRetailers: input.enabled.length === 0,
    missingStores,
  };
}
