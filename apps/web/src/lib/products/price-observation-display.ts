/**
 * Internal ingestion identifiers are useful for auditing but are never
 * customer-facing provenance. The retailer name is displayed separately.
 */
export function priceObservationKind(source: string | null | undefined) {
  const value = source?.trim().toLocaleLowerCase("en-AU") ?? "";
  if (value.startsWith("receipt:")) return "Receipt purchase";
  if (value === "coles-pilot" || value === "woolworths-controlled-import" || value === "retailer-api" || value === "coles-woolworths-mcp" || value === "auscost") {
    return "Catalogue price";
  }
  return "Recorded price";
}
