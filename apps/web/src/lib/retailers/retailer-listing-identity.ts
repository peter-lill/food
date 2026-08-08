type ListingCandidate = {
  retailer: string;
  externalId: string | null;
  productName: string;
  packSize: string | null;
};

/**
 * Some catalogue searches expose a price and product name but no retailer SKU.
 * Keep those listings separate by their exact returned identity rather than
 * inventing an external SKU or collapsing different pack sizes together.
 */
export function retailerListingIdentity(candidate: ListingCandidate) {
  if (candidate.externalId) {
    return { kind: "external-id" as const, externalId: candidate.externalId };
  }

  return {
    kind: "catalogue-identity" as const,
    retailer: candidate.retailer,
    retailerProductName: candidate.productName,
    packSize: candidate.packSize,
  };
}

