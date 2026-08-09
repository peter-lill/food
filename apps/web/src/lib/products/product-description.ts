export function heroProductDescription(value: string | null) {
  if (!value?.trim()) return null;
  const ingredientsIndex = value.search(/\bingredients?\s*:/i);
  const summary = ingredientsIndex >= 0 ? value.slice(0, ingredientsIndex) : value;
  return summary.replace(/\s+/g, " ").trim() || null;
}
