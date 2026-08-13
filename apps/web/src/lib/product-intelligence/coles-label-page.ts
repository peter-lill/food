type ColesNutritionBreakdown = {
  title?: unknown;
  nutrients?: Array<{ nutrient?: unknown; value?: unknown }>;
};

type ColesProduct = {
  additionalInfo?: Array<{ title?: unknown; description?: unknown }>;
  nutrition?: {
    servingSize?: unknown;
    servingsPerPackage?: unknown;
    breakdown?: ColesNutritionBreakdown[];
  };
};

function text(value: unknown) {
  return typeof value === "string"
    ? value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function productFromNextData(html: string): ColesProduct | null {
  const match = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;
  try {
    const payload = JSON.parse(match[1]) as { props?: { pageProps?: { product?: ColesProduct } } };
    return payload.props?.pageProps?.product ?? null;
  } catch {
    return null;
  }
}

function productFromUnknown(value: unknown): ColesProduct | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = productFromUnknown(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.nutrition && (record.additionalInfo || typeof record.nutrition === "object")) return record as ColesProduct;
  for (const item of Object.values(record)) {
    const found = productFromUnknown(item);
    if (found) return found;
  }
  return null;
}

function nutrientName(value: string) {
  if (/^fat\s*-\s*saturated$/i.test(value)) return "Saturated Fat";
  if (/^sugars?\s*-\s*total$/i.test(value)) return "Sugars";
  return value;
}

function labelSource(product: ColesProduct | null) {
  if (!product) return null;
  const lines = ["Nutrition Information"];
  const nutrition = product.nutrition;
  const servings = text(nutrition?.servingsPerPackage);
  const servingSize = text(nutrition?.servingSize);
  if (servings) lines.push(`Servings per package: ${servings}`);
  if (servingSize) lines.push(`Serving size: ${servingSize}`);

  const breakdowns = nutrition?.breakdown ?? [];
  const perServing = breakdowns.find((item) => /per serving/i.test(text(item.title)));
  const per100 = breakdowns.find((item) => /per 100/i.test(text(item.title)));
  const per100Values = new Map(
    (per100?.nutrients ?? []).map((item) => [text(item.nutrient).toLocaleLowerCase("en-AU"), text(item.value)]),
  );
  for (const nutrient of perServing?.nutrients ?? per100?.nutrients ?? []) {
    const name = text(nutrient.nutrient);
    if (!name) continue;
    const servingValue = perServing ? text(nutrient.value) : "";
    const per100Value = per100Values.get(name.toLocaleLowerCase("en-AU")) ?? (perServing ? "" : text(nutrient.value));
    lines.push(`${nutrientName(name)}: ${[servingValue, per100Value].filter(Boolean).join(" ")}`);
  }

  for (const item of product.additionalInfo ?? []) {
    const title = text(item.title);
    const description = text(item.description);
    if (!title || !description) continue;
    if (/^ingredients$/i.test(title)) {
      lines.push(`Ingredients: ${description.replace(/^ingredients?\s*:?[\s.]*/i, "")}`);
    } else if (/^allergens?$/i.test(title)) {
      const contains = description.match(/contains\s+([\s\S]*?)(?=may contain|$)/i)?.[1]?.trim();
      const mayContain = description.match(/may contain\s+([\s\S]*)$/i)?.[1]?.trim();
      if (contains) lines.push(`Contains: ${contains}`);
      if (mayContain) lines.push(`May contain: ${mayContain}`);
    }
  }
  return lines.join("\n");
}

export function colesProductLabelSource(html: string) {
  return labelSource(productFromNextData(html));
}

export function colesProductLabelSourceFromData(value: unknown) {
  return labelSource(productFromUnknown(value));
}
