import { identifyGrocery } from "@/lib/grocery-intelligence/identity";

const unresolvedRecipeNoise = /(?:^|\b)(?:or|and|each|extra|approximately|cm|pieces?|sticks?|garnish|serve|lengthways|horizontally|vertically|crosswise|thawed|torn|crumbled|firmly|packed|peeler|into|plus)(?:\b|$)/i;

export function genericImageIdentity(value: string) {
  const identity = identifyGrocery(value)?.canonicalName.trim() ?? "";
  if (identity.length < 2 || identity.length > 60) return null;
  if (/\d/.test(identity) || unresolvedRecipeNoise.test(identity)) return null;
  if (!/[a-z]{2}/i.test(identity)) return null;
  return identity;
}
