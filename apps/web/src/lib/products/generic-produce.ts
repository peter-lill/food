import { ProductType } from "@prisma/client";
import { normaliseProductText } from "./product-normalisation";

/**
 * Strong evidence that a Fruit & vegetables catalogue item is a prepared or
 * value-added grocery product rather than ordinary fresh produce.
 *
 * Keep this deliberately conservative. Fruit/vegetable varieties, colours,
 * sizes, loose/each/bunch/punnet forms and simple weight/count packs remain
 * GENERIC_PRODUCE by default.
 */
const preparedProducePatterns = [
  /\bsalad\s+(?:kit|bowl|tub)\b/,
  /\bstir\s+fry\b/,
  /\bsoup\s+kit\b/,
  /\bveggie\s+(?:mix|pot)\b/,
  /\bvegetable\s+(?:mix|medley)\b/,
  /\bcoleslaw\b/,
  /\bguacamole\b/,
  /\b(?:garlic|ginger)\s+(?:(?:[a-z]+)\s+){0,3}(?:paste|puree)\b/,
] as const;

export function isPreparedProduceName(value: string) {
  const identity = normaliseProductText(value);
  return preparedProducePatterns.some((pattern) => pattern.test(identity));
}

export function produceProductType(value: string) {
  return isPreparedProduceName(value)
    ? ProductType.PACKAGED
    : ProductType.GENERIC_PRODUCE;
}
