export type AustralianNipNutrient = {
  perServing: number | null;
  per100: number | null;
  unit: "kJ" | "g" | "mg";
};

export type AustralianNipParseResult = {
  servingSize: string | null;
  servingQuantity: number | null;
  servingUnit: string | null;
  servingsPerPackage: number | null;
  nutrients: {
    energy: AustralianNipNutrient;
    protein: AustralianNipNutrient;
    fat: AustralianNipNutrient;
    saturatedFat: AustralianNipNutrient;
    carbohydrate: AustralianNipNutrient;
    sugars: AustralianNipNutrient;
    fibre: AustralianNipNutrient;
    sodium: AustralianNipNutrient;
  };
  ingredientsText: string | null;
  contains: string[];
  mayContain: string[];
  confidence: number;
};

function decode(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"')
    .replace(/\\n|\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}

function linesFromSource(source: string) {
  const decoded = decode(source);
  const scripts = [...decoded.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((value) => /serving|nutrition|ingredient|allergen|contains/i.test(value));
  const visible = decoded
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td|\/th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return [...new Set([...scripts, visible]
    .join("\n")
    .replace(/[{}\[\]]/g, "\n")
    .replace(/",\s*"/g, "\n")
    .replace(/"\s*:\s*"/g, ": ")
    .replace(/"\s*:\s*/g, ": ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[",]+$/g, "").replace(/^\s*[",]+/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean))];
}

function numberFrom(value: string | null) {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/<?\s*([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function valueAfter(lines: string[], patterns: RegExp[]) {
  for (const pattern of patterns) {
    const index = lines.findIndex((line) => pattern.test(line));
    if (index < 0) continue;
    const same = lines[index].replace(pattern, "").replace(/^\s*[:=,-]\s*/, "").trim();
    const value = same || lines[index + 1] || null;
    if (value && !/^(null|undefined|n\/a)$/i.test(value)) return value.replace(/^['"]|['"]$/g, "").trim();
  }
  return null;
}

function parseServing(lines: string[]) {
  const servingSize = valueAfter(lines, [
    /^serving\s*size\b/i,
    /^size\s*per\s*serve\b/i,
    /^portion\s*size\b/i,
    /^servingSize(?:Description|Text)?\s*:/i,
    /^serveSize\s*:/i,
  ]);
  const servings = valueAfter(lines, [
    /^servings?\s+per\s+(?:pack|package|container)\b/i,
    /^serves?\s+per\s+pack\b/i,
    /^number\s+of\s+servings\b/i,
    /^pack\s+serves\b/i,
    /^servingsPerPackage\s*:/i,
    /^numberOfServings\s*:/i,
    /^servingsPerPack\s*:/i,
  ]);
  const sizeMatch = servingSize?.match(/([0-9]+(?:\.[0-9]+)?)\s*(g|kg|ml|mL|L|item|slice|piece|tablet|capsule)s?\b/i) ?? null;
  let quantity = sizeMatch ? Number(sizeMatch[1]) : null;
  let unit = sizeMatch?.[2] ?? null;
  if (unit?.toLowerCase() === "ml") unit = "mL";
  else if (unit?.toLowerCase() === "l") unit = "L";
  else if (unit) unit = unit.toLowerCase();
  if (quantity !== null && unit === "kg") { quantity *= 1000; unit = "g"; }
  if (quantity !== null && unit === "L") { quantity *= 1000; unit = "mL"; }
  return { servingSize, servingQuantity: quantity, servingUnit: unit, servingsPerPackage: numberFrom(servings) };
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[–—-]/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseNutrient(lines: string[], aliases: string[], unit: "kJ" | "g" | "mg"): AustralianNipNutrient {
  const keys = aliases.map(normalise);
  const index = lines.findIndex((line) => {
    const key = normalise(line.split(":")[0]);
    return keys.includes(key) || keys.some((candidate) => key.endsWith(` ${candidate}`));
  });
  if (index < 0) return { perServing: null, per100: null, unit };
  const pattern = unit === "kJ" ? /<?\s*[0-9]+(?:\.[0-9]+)?\s*kJ\b/gi : unit === "mg" ? /<?\s*[0-9]+(?:\.[0-9]+)?\s*mg\b/gi : /<?\s*[0-9]+(?:\.[0-9]+)?\s*g\b/gi;
  const values: number[] = [];
  for (const line of lines.slice(index, index + 20)) {
    for (const match of line.matchAll(pattern)) {
      const parsed = numberFrom(match[0]);
      if (parsed !== null && !values.includes(parsed)) values.push(parsed);
    }
    if (values.length >= 2) break;
  }
  return { perServing: values[0] ?? null, per100: values[1] ?? values[0] ?? null, unit };
}

function section(lines: string[], starts: RegExp[], ends: RegExp[]) {
  for (const start of starts) {
    const index = lines.findIndex((line) => start.test(line));
    if (index < 0) continue;
    const same = lines[index].replace(start, "").replace(/^\s*[:=,-]\s*/, "").trim();
    if (same.length > 2) return same;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (ends.some((pattern) => pattern.test(lines[cursor]))) { end = cursor; break; }
    }
    const body = lines.slice(index + 1, end).join(" ").trim();
    if (body) return body;
  }
  return null;
}

function allergens(value: string | null) {
  if (!value) return [];
  return [...new Set(value.replace(/^(contains|may contain|allergens?)\s*:?\s*/i, "").split(/[,;]|\band\b/i).map((item) => item.replace(/[.]+$/g, "").trim()).filter(Boolean))];
}

export function parseAustralianNip(source: string): AustralianNipParseResult | null {
  const lines = linesFromSource(source);
  if (!lines.some((line) => /nutrition information|serving size|servings per|ingredients?\s*:/i.test(line))) return null;
  const serving = parseServing(lines);
  const ingredientsText = valueAfter(lines, [/^ingredients?\s*:/i, /^ingredientsList\s*:/i, /^ingredientStatement\s*:/i])
    ?? section(lines, [/^ingredients?$/i], [/^allergens?$/i, /^contains\b/i, /^may contain\b/i, /^nutrition information$/i, /^storage$/i]);
  const containsText = valueAfter(lines, [/^contains\s*:/i, /^allergens?\s*:/i, /^allergenStatement\s*:/i]);
  const mayContainText = valueAfter(lines, [/^may contain\s*:/i, /^mayContain\s*:/i, /^mayContainStatement\s*:/i]);
  const nutrients = {
    energy: parseNutrient(lines, ["Energy", "Energy Per 100g", "Energy Per 100mL"], "kJ"),
    protein: parseNutrient(lines, ["Protein", "Protein Per 100g", "Protein Per 100mL"], "g"),
    fat: parseNutrient(lines, ["Fat, Total", "Fat Total", "Total Fat", "Fat Per 100g"], "g"),
    saturatedFat: parseNutrient(lines, ["Saturated", "Saturated Fat", "Saturated Per 100g"], "g"),
    carbohydrate: parseNutrient(lines, ["Carbohydrate", "Carbohydrate Total", "Total Carbohydrate", "Carbohydrate Per 100g"], "g"),
    sugars: parseNutrient(lines, ["Sugars", "Sugar", "Total Sugars", "Sugars Per 100g"], "g"),
    fibre: parseNutrient(lines, ["Dietary Fibre", "Dietary Fiber", "Fibre", "Fiber", "Fibre Per 100g"], "g"),
    sodium: parseNutrient(lines, ["Sodium", "Sodium Per 100g"], "mg"),
  };
  const score = [serving.servingSize, serving.servingsPerPackage, ingredientsText, ...Object.values(nutrients).map((value) => value.per100)].filter((value) => value !== null).length;
  return {
    ...serving,
    nutrients,
    ingredientsText,
    contains: allergens(containsText),
    mayContain: allergens(mayContainText),
    confidence: Math.min(1, score / 11),
  };
}
