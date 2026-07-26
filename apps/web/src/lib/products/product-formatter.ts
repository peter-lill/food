import { foodItemIdentity, normaliseGroceryUnit } from "./food-item-intelligence";

const lowercaseWords = new Set(["and", "of", "or", "the", "with"]);
const casingOverrides = new Map<string, string>([
  ["ml", "mL"],
  ["l", "L"],
  ["kg", "kg"],
  ["g", "g"],
  ["bbq", "BBQ"],
  ["ev", "EV"],
]);

function cleanPunctuation(value: string) {
  return value
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s*([,;:])\s*/g, "$1 ")
    .replace(/\s+([.!?])/g, "$1")
    .replace(/([.!?]){2,}/g, "$1")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*×\s*/g, " × ")
    .replace(/\b(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|l)\b/gi, (_match, amount: string, unit: string) => {
      const normalisedUnit = normaliseGroceryUnit(unit);
      return `${amount} ${normalisedUnit}`;
    })
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,:;.-]+$/, "");
}

function titleCase(value: string) {
  return cleanPunctuation(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const punctuation = word.match(/^([^a-z0-9]*)(.*?)([^a-z0-9]*)$/i);
      const prefix = punctuation?.[1] ?? "";
      const core = punctuation?.[2] ?? word;
      const suffix = punctuation?.[3] ?? "";
      const lower = core.toLocaleLowerCase("en-AU");
      const override = casingOverrides.get(lower);
      if (override) return `${prefix}${override}${suffix}`;
      if (index > 0 && lowercaseWords.has(lower)) return `${prefix}${lower}${suffix}`;
      return `${prefix}${lower.charAt(0).toLocaleUpperCase("en-AU")}${lower.slice(1)}${suffix}`;
    })
    .join(" ");
}

export function formatProductName(value: string) {
  return titleCase(foodItemIdentity(value));
}

export function formatRetailProductName(value: string) {
  return cleanPunctuation(value);
}

export function formatSearchQuery(value: string) {
  return cleanPunctuation(foodItemIdentity(value));
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function formatGroceryUnit(value: string | null | undefined, quantity?: number | null) {
  const unit = normaliseGroceryUnit(value);
  if (unit === "each") return quantity === 1 ? "item" : "items";
  return unit;
}

export function formatProductQuantity(quantity: number | null, unit: string | null) {
  if (quantity === null) return null;
  return `${formatQuantity(quantity)} ${formatGroceryUnit(unit, quantity)}`;
}

export function formatMeasurement(value: number, unit: string) {
  const formattedUnit = normaliseGroceryUnit(unit);
  return `${formatQuantity(value)} ${formattedUnit}`;
}
