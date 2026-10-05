import { comparablePackSize } from "./retailer-product-identity";

export type SellablePackListing = {
  packSize: string | null;
  retailerProductName: string;
};

export function sellablePackIdentity(listing: SellablePackListing) {
  return comparablePackSize(listing.packSize) ?? comparablePackSize(listing.retailerProductName);
}

export function groupListingsBySellablePack<T extends SellablePackListing>(listings: T[]) {
  const groups = new Map<string, T[]>();
  const unknown: T[] = [];
  for (const listing of listings) {
    const pack = sellablePackIdentity(listing);
    if (!pack) {
      unknown.push(listing);
      continue;
    }
    const group = groups.get(pack) ?? [];
    group.push(listing);
    groups.set(pack, group);
  }
  return { groups, unknown, contaminated: groups.size > 1 };
}
