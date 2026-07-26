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

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("en-AU");
      const override = casingOverrides.get(lower);
      if (override) return override;
      if (index > 0 && lowercaseWords.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("en-AU") + lower.slice(1);
    })
    .join(" ");
}

export function formatProductName(value: string) {
  return titleCase(foodItemIdentity(value));
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
