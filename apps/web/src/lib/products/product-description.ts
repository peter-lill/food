function normaliseComparableText(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, "").trim();
}

export function heroProductDescription(value: string | null, brand: string | null = null) {
  if (!value?.trim()) return null;
  const ingredientsIndex = value.search(/\bingredients?\s*:/i);
  const summary = ingredientsIndex >= 0 ? value.slice(0, ingredientsIndex) : value;
  const cleaned = summary.replace(/\s+/g, " ").trim();
  if (!cleaned || (brand && normaliseComparableText(cleaned) === normaliseComparableText(brand))) return null;
  return cleaned;
}
