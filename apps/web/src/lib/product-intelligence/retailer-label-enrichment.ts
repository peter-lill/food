import { prisma } from "@/lib/prisma";

const browserHeaders = {
  "Accept-Language": "en-AU,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

type RetailerLabel = {
  servingSize: string | null;
  servingQuantity: number | null;
  servingUnit: string | null;
  servingsPerPackage: number | null;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  saturatedFatGrams: number | null;
  fibreGrams: number | null;
  sugarGrams: number | null;
  sodiumMg: number | null;
  ingredientsText: string | null;
  allergens: string[];
  mayContainAllergens: string[];
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}

function htmlLines(html: string) {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td|\/th)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[–—-]/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function numberFrom(value: string) {
  const match = value.replace(/,/g, "").match(/<?\s*([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function firstMatchingLine(lines: string[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line)) ?? null;
}

function valueAfterLabel(lines: string[], pattern: RegExp) {
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) return null;
  const sameLine = lines[index].replace(pattern, "").replace(/^\s*[:,]\s*/, "").trim();
  if (sameLine) return sameLine;
  return lines[index + 1] ?? null;
}

function parseServing(lines: string[]) {
  const servingsText = valueAfterLabel(lines, /servings?\s+per\s+(?:pack|package)/i);
  const servingSize = valueAfterLabel(lines, /serving\s+size/i);
  const match = servingSize?.match(/([0-9]+(?:\.[0-9]+)?)\s*(g|ml|mL|item|slice|piece|tablet|capsule)s?\b/i) ?? null;
  const rawUnit = match?.[2] ?? "";
  return {
    servingSize: servingSize || null,
    servingQuantity: match ? Number(match[1]) : null,
    servingUnit: rawUnit.toLocaleLowerCase("en-AU") === "ml" ? "mL" : rawUnit.toLocaleLowerCase("en-AU") || null,
    servingsPerPackage: servingsText ? numberFrom(servingsText) : null,
  };
}

function nutrientPer100(lines: string[], aliases: string[], unit: "kJ" | "g" | "mg") {
  const index = lines.findIndex((line) => aliases.some((alias) => normalise(line) === normalise(alias)));
  if (index < 0) return null;
  const values: number[] = [];
  for (const line of lines.slice(index + 1, index + 14)) {
    const unitPattern = unit === "kJ" ? /<?\s*[0-9]+(?:\.[0-9]+)?\s*kJ\b/i : unit === "mg" ? /<?\s*[0-9]+(?:\.[0-9]+)?\s*mg\b/i : /<?\s*[0-9]+(?:\.[0-9]+)?\s*g\b/i;
    if (!unitPattern.test(line)) continue;
    const parsed = numberFrom(line);
    if (parsed === null || values.includes(parsed)) continue;
    values.push(parsed);
    if (values.length === 2) break;
  }
  return values.length >= 2 ? values[1] : values[0] ?? null;
}

function section(lines: string[], start: RegExp, ends: RegExp[]) {
  const startIndex = lines.findIndex((line) => start.test(line));
  if (startIndex < 0) return null;
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (ends.some((pattern) => pattern.test(lines[index]))) {
      endIndex = index;
      break;
    }
  }
  const body = lines.slice(startIndex + 1, endIndex).join(" ").replace(/^ingredients?\s*/i, "").trim();
  return body || null;
}

function allergenList(value: string | null) {
  if (!value) return [];
  return [...new Set(value
    .replace(/^(?:contains|may contain)\s*:?\s*/i, "")
    .split(/[,;]|\band\b/i)
    .map((item) => item.replace(/[.]+$/g, "").trim())
    .filter(Boolean))];
}

function parseWoolworthsLabel(html: string): RetailerLabel | null {
  const lines = htmlLines(html);
  if (!lines.some((line) => /nutrition information/i.test(line))) return null;
  const serving = parseServing(lines);
  const ingredientsText = section(lines, /^ingredients$/i, [/^allergens?$/i, /^nutrition information$/i, /^directions$/i]);
  const contains = firstMatchingLine(lines, /^contains\s*:/i);
  const mayContain = firstMatchingLine(lines, /^may contain\s*:/i);
  const energyKj = nutrientPer100(lines, ["Energy"], "kJ");
  return {
    ...serving,
    calories: energyKj === null ? null : energyKj / 4.184,
    proteinGrams: nutrientPer100(lines, ["Protein"], "g"),
    carbsGrams: nutrientPer100(lines, ["Carbohydrate"], "g"),
    fatGrams: nutrientPer100(lines, ["Fat, Total", "Fat Total"], "g"),
    saturatedFatGrams: nutrientPer100(lines, ["Saturated", "– Saturated"], "g"),
    fibreGrams: nutrientPer100(lines, ["Dietary Fibre", "Fibre"], "g"),
    sugarGrams: nutrientPer100(lines, ["Sugars", "– Sugars"], "g"),
    sodiumMg: nutrientPer100(lines, ["Sodium"], "mg"),
    ingredientsText,
    allergens: allergenList(contains),
    mayContainAllergens: allergenList(mayContain),
  };
}

async function fetchLabel(url: string, retailer: string) {
  if (retailer !== "Woolworths") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { ...browserHeaders, Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return null;
    return parseWoolworthsLabel(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichProductFromRetailerLabels(productId: string) {
  const listings = await prisma.storeProduct.findMany({
    where: { productId, active: true, productUrl: { not: null } },
    orderBy: [{ retailer: "desc" }, { lastSeenAt: "desc" }],
    select: { retailer: true, productUrl: true },
  });

  for (const listing of listings) {
    if (!listing.productUrl) continue;
    const label = await fetchLabel(listing.productUrl, listing.retailer);
    if (!label) continue;
    await prisma.product.update({
      where: { id: productId },
      data: {
        servingSize: label.servingSize,
        servingQuantity: label.servingQuantity,
        servingUnit: label.servingUnit,
        servingsPerPackage: label.servingsPerPackage,
        calories: label.calories,
        proteinGrams: label.proteinGrams,
        carbsGrams: label.carbsGrams,
        fatGrams: label.fatGrams,
        saturatedFatGrams: label.saturatedFatGrams,
        fibreGrams: label.fibreGrams,
        sugarGrams: label.sugarGrams,
        sodiumMg: label.sodiumMg,
        ingredientsText: label.ingredientsText,
        allergens: label.allergens,
        mayContainAllergens: label.mayContainAllergens,
      },
    });
    return { status: "completed" as const, retailer: listing.retailer };
  }
  return { status: "not-found" as const };
}
