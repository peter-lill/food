import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const browserHeaders = {
  "Accept-Language": "en-AU,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

export type RetailerLabel = {
  retailer: string;
  sourceUrl: string;
  retrievedAt: Date;
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

function decodeEmbedded(value: string) {
  return decodeHtml(value)
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0027/gi, "'")
    .replace(/\\u0022/gi, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
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

function embeddedLines(html: string) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => decodeEmbedded(match[1]))
    .filter((value) => /serving|nutrition|ingredient|allergen|contains/i.test(value));

  return scripts
    .join("\n")
    .replace(/[{}\[\]]/g, "\n")
    .replace(/",\s*"/g, "\n")
    .replace(/"\s*:\s*"/g, ": ")
    .replace(/"\s*:\s*/g, ": ")
    .replace(/<[^>]+>/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[",]+$/g, "").replace(/^\s*[",]+/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function combinedLines(html: string) {
  const values = [...embeddedLines(html), ...htmlLines(html)];
  return [...new Set(values)];
}

function normalise(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function valueFromKeys(lines: string[], keys: RegExp[]) {
  for (const key of keys) {
    const value = valueAfterLabel(lines, key);
    if (value && !/^null$/i.test(value)) return value.replace(/^['"]|['"]$/g, "").trim();
  }
  return null;
}

function parseServing(lines: string[]) {
  const servingsText = valueFromKeys(lines, [
    /^servings?\s+per\s+(?:pack|package)/i,
    /^servingsPerPackage\s*:/i,
    /^numberOfServings\s*:/i,
  ]);
  const servingSize = valueFromKeys(lines, [
    /^serving\s+size/i,
    /^servingSize\s*:/i,
    /^servingSizeDescription\s*:/i,
  ]);
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
  const aliasValues = aliases.map(normalise);
  const index = lines.findIndex((line) => {
    const candidate = normalise(line.split(":")[0]);
    return aliasValues.includes(candidate) || aliasValues.some((alias) => candidate.endsWith(` ${alias}`));
  });
  if (index < 0) return null;

  const values: number[] = [];
  for (const line of lines.slice(index, index + 18)) {
    const unitPattern = unit === "kJ"
      ? /<?\s*[0-9]+(?:\.[0-9]+)?\s*kJ\b/i
      : unit === "mg"
        ? /<?\s*[0-9]+(?:\.[0-9]+)?\s*mg\b/i
        : /<?\s*[0-9]+(?:\.[0-9]+)?\s*g\b/i;
    if (!unitPattern.test(line)) continue;
    const parsed = numberFrom(line.replace(/^[^:]*:\s*/, ""));
    if (parsed === null || values.includes(parsed)) continue;
    values.push(parsed);
    if (values.length === 2) break;
  }
  return values.length >= 2 ? values[1] : values[0] ?? null;
}

function section(lines: string[], start: RegExp, ends: RegExp[]) {
  const startIndex = lines.findIndex((line) => start.test(line));
  if (startIndex < 0) return null;
  const sameLine = lines[startIndex].replace(start, "").replace(/^\s*[:,]\s*/, "").trim();
  if (sameLine && sameLine.length > 2) return sameLine;
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
    .replace(/^(?:contains|may contain|allergens?)\s*:?\s*/i, "")
    .split(/[,;]|\band\b/i)
    .map((item) => item.replace(/[.]+$/g, "").trim())
    .filter((item) => item && !/^not (?:available|specified|provided)$/i.test(item)))];
}

function parseLabel(html: string, retailer: string, sourceUrl: string): RetailerLabel | null {
  const lines = combinedLines(html);
  const hasLabelMarkers = lines.some((line) => /nutrition information|servingSize|ingredients?\s*:|allergens?\s*:/i.test(line));
  if (!hasLabelMarkers) return null;

  const serving = parseServing(lines);
  const ingredientsText = valueFromKeys(lines, [
    /^ingredients?\s*:/i,
    /^ingredientsList\s*:/i,
    /^ingredientStatement\s*:/i,
  ]) ?? section(lines, /^ingredients?$/i, [
    /^allergens?$/i,
    /^contains\b/i,
    /^may contain\b/i,
    /^nutrition information$/i,
    /^directions$/i,
    /^storage$/i,
  ]);
  const contains = valueFromKeys(lines, [
    /^contains\s*:/i,
    /^allergens?\s*:/i,
    /^allergenStatement\s*:/i,
  ]);
  const mayContain = valueFromKeys(lines, [
    /^may contain\s*:/i,
    /^mayContain\s*:/i,
    /^mayContainStatement\s*:/i,
  ]);
  const energyKj = nutrientPer100(lines, ["Energy", "Energy Per 100g", "Energy Per 100mL"], "kJ");

  return {
    retailer,
    sourceUrl,
    retrievedAt: new Date(),
    ...serving,
    calories: energyKj === null ? null : energyKj / 4.184,
    proteinGrams: nutrientPer100(lines, ["Protein", "Protein Per 100g", "Protein Per 100mL"], "g"),
    carbsGrams: nutrientPer100(lines, ["Carbohydrate", "Carbohydrate Total", "Carbohydrate Per 100g"], "g"),
    fatGrams: nutrientPer100(lines, ["Fat, Total", "Fat Total", "Fat Per 100g"], "g"),
    saturatedFatGrams: nutrientPer100(lines, ["Saturated", "Saturated Fat", "Saturated Per 100g"], "g"),
    fibreGrams: nutrientPer100(lines, ["Dietary Fibre", "Fibre", "Fibre Per 100g"], "g"),
    sugarGrams: nutrientPer100(lines, ["Sugars", "Sugar", "Sugars Per 100g"], "g"),
    sodiumMg: nutrientPer100(lines, ["Sodium", "Sodium Per 100g"], "mg"),
    ingredientsText,
    allergens: allergenList(contains),
    mayContainAllergens: allergenList(mayContain),
  };
}

async function fetchLabel(url: string, retailer: string) {
  if (!/^(Coles|Woolworths)$/i.test(retailer)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { ...browserHeaders, Accept: "text/html,application/xhtml+xml,application/json;q=0.9" },
    });
    if (!response.ok) return null;
    return parseLabel(await response.text(), retailer, url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function completeness(label: RetailerLabel) {
  return [
    label.servingSize,
    label.servingsPerPackage,
    label.calories,
    label.proteinGrams,
    label.carbsGrams,
    label.fatGrams,
    label.saturatedFatGrams,
    label.sugarGrams,
    label.sodiumMg,
    label.ingredientsText,
    label.allergens.length ? label.allergens : null,
    label.mayContainAllergens.length ? label.mayContainAllergens : null,
  ].filter((value) => value !== null && value !== undefined).length;
}

function mergeLabels(labels: RetailerLabel[]) {
  const ranked = [...labels].sort((left, right) => completeness(right) - completeness(left));
  const pick = <K extends keyof RetailerLabel>(key: K) => ranked.find((label) => {
    const value = label[key];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
  })?.[key] ?? null;

  return {
    servingSize: pick("servingSize") as string | null,
    servingQuantity: pick("servingQuantity") as number | null,
    servingUnit: pick("servingUnit") as string | null,
    servingsPerPackage: pick("servingsPerPackage") as number | null,
    calories: pick("calories") as number | null,
    proteinGrams: pick("proteinGrams") as number | null,
    carbsGrams: pick("carbsGrams") as number | null,
    fatGrams: pick("fatGrams") as number | null,
    saturatedFatGrams: pick("saturatedFatGrams") as number | null,
    fibreGrams: pick("fibreGrams") as number | null,
    sugarGrams: pick("sugarGrams") as number | null,
    sodiumMg: pick("sodiumMg") as number | null,
    ingredientsText: pick("ingredientsText") as string | null,
    allergens: (pick("allergens") as string[] | null) ?? [],
    mayContainAllergens: (pick("mayContainAllergens") as string[] | null) ?? [],
    source: [...new Set(ranked.map((label) => label.retailer))].join(" + "),
    retrievedAt: ranked[0]?.retrievedAt ?? new Date(),
  };
}

export async function enrichProductFromRetailerLabels(productId: string) {
  const listings = await prisma.storeProduct.findMany({
    where: {
      productId,
      active: true,
      productUrl: { not: null },
      retailer: { in: ["Coles", "Woolworths"] },
    },
    orderBy: [{ lastSeenAt: "desc" }],
    select: { retailer: true, productUrl: true },
  });

  const labels = (await Promise.all(listings.map(async (listing) => {
    if (!listing.productUrl) return null;
    return fetchLabel(listing.productUrl, listing.retailer);
  }))).filter((label): label is RetailerLabel => label !== null);

  if (!labels.length) return { status: "not-found" as const };

  const merged = mergeLabels(labels);
  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: {
        servingSize: merged.servingSize ?? undefined,
        servingQuantity: merged.servingQuantity ?? undefined,
        servingUnit: merged.servingUnit ?? undefined,
        servingsPerPackage: merged.servingsPerPackage ?? undefined,
        calories: merged.calories ?? undefined,
        proteinGrams: merged.proteinGrams ?? undefined,
        carbsGrams: merged.carbsGrams ?? undefined,
        fatGrams: merged.fatGrams ?? undefined,
        saturatedFatGrams: merged.saturatedFatGrams ?? undefined,
        fibreGrams: merged.fibreGrams ?? undefined,
        sugarGrams: merged.sugarGrams ?? undefined,
        sodiumMg: merged.sodiumMg ?? undefined,
        allergens: merged.allergens.length ? merged.allergens : undefined,
      },
    }),
    prisma.$executeRaw(Prisma.sql`
      UPDATE "Product"
      SET
        "ingredientsText" = COALESCE(${merged.ingredientsText}, "ingredientsText"),
        "mayContainAllergens" = CASE
          WHEN cardinality(${merged.mayContainAllergens}::text[]) > 0 THEN ${merged.mayContainAllergens}::text[]
          ELSE "mayContainAllergens"
        END
      WHERE "id" = ${productId}
    `),
  ]);

  return {
    status: "completed" as const,
    retailers: [...new Set(labels.map((label) => label.retailer))],
    source: merged.source,
    retrievedAt: merged.retrievedAt,
  };
}

export async function getProductLabelText(productId: string) {
  const rows = await prisma.$queryRaw<Array<{
    ingredientsText: string | null;
    mayContainAllergens: string[];
  }>>(Prisma.sql`
    SELECT "ingredientsText", "mayContainAllergens"
    FROM "Product"
    WHERE "id" = ${productId}
    LIMIT 1
  `);
  return rows[0] ?? { ingredientsText: null, mayContainAllergens: [] };
}
