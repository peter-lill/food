export type GeneratedProductContent = { overview: string; uses: string[]; storage: string[] };

export function parseGeneratedProductContent(raw: string): GeneratedProductContent {
  const value = JSON.parse(raw) as Partial<GeneratedProductContent>;
  const overview = typeof value.overview === "string" ? value.overview.trim() : "";
  const uses = Array.isArray(value.uses) ? value.uses.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  const storage = Array.isArray(value.storage) ? value.storage.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  if (overview.length < 30 || overview.length > 400 || uses.length > 6 || storage.length > 5) throw new Error("Generated product content did not pass validation.");
  const combined = [overview, ...uses, ...storage].join(" ");
  if (/cures?|treats?|prevents?|guaranteed|allergen[- ]free|safe for|health benefit/i.test(combined)) throw new Error("Generated product content contained a prohibited claim.");
  return { overview, uses, storage };
}
