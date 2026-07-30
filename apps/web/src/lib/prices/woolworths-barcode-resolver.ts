import {
  resolveWoolworthsProductReference,
  searchColesAndWoolworthsCatalogue,
  type RetailerCatalogueCandidate,
} from "@/lib/prices/coles-woolworths-provider";

function digits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

export async function resolveWoolworthsProductByBarcode(
  barcode: string,
): Promise<RetailerCatalogueCandidate | null> {
  const normalisedBarcode = digits(barcode);
  if (!/^\d{7,14}$/.test(normalisedBarcode)) return null;

  const results = await searchColesAndWoolworthsCatalogue(normalisedBarcode).catch(() => []);
  const exact = results.find((candidate) => (
    candidate.retailer === "Woolworths"
    && digits(candidate.barcode) === normalisedBarcode
    && Boolean(candidate.externalId)
  ));

  if (!exact?.externalId) return null;

  const resolved = await resolveWoolworthsProductReference(exact.externalId).catch(() => null);
  return resolved?.imageUrl ? resolved : exact.imageUrl ? exact : null;
}
