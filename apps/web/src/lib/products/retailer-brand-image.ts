/**
 * Retailer branding is useful in the UI, but never a valid product photograph.
 * Keep this deliberately precise: do not reject genuine product packaging that
 * happens to mention a retailer in its URL.
 */
export function isRetailerBrandImageUrl(value: string | null | undefined) {
  if (!value) return false;
  return /(?:wapple-logo|woolworths-logo|coles-logo|aldi-logo|drakes-logo)/i.test(value);
}
