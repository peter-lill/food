import { identifyGrocery } from "@/lib/grocery-intelligence/identity";

const unresolvedRecipeNoise = /(?:^|\b)(?:or|and|each|extra|approximately|cm|pieces?|sticks?|garnish|serve|lengthways|horizontally|vertically|crosswise|thawed|torn|crumbled|firmly|packed|peeler|into|plus)(?:\b|$)/i;

const familyAliases = new Map<string, string>([
  ["broccolini ends", "Broccolini"],
  ["clove garlic", "Garlic"],
  ["garlic clove", "Garlic"],
  ["garlic cloves", "Garlic"],
  ["leek white part only", "Leek"],
  ["leeks", "Leek"],
  ["mozzarella cheese", "Mozzarella"],
  ["oregano leaves", "Oregano"],
  ["thyme leaves", "Thyme"],
  ["coriander leaves", "Coriander"],
  ["flat leaf parsley leaves", "Parsley"],
  ["mint leaves", "Mint"],
  ["pepitas pumpkin seeds", "Pepitas"],
  ["pita breads", "Pita Bread"],
  ["pita pocket bread", "Pita Bread"],
  ["plain greek yoghurt", "Greek Yoghurt"],
  ["wholegrain sourdough bread", "Wholegrain Sourdough"],
  ["lemon zest rind", "Lemon Rind"],
  ["extra virgin olive oil", "Olive Oil"],
  ["korma curry paste", "Korma Paste"],
]);

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function genericImageIdentity(value: string) {
  if (/^\s*or\b/i.test(value)) return null;
  const grocery = identifyGrocery(value);
  let identity = (grocery?.canonicalName ?? "").trim();
  identity = familyAliases.get(normalise(identity)) ?? identity;
  identity = identity
    .replace(/^(?:extra\s+)?pinch\s+/i, "")
    .replace(/^(?:medium\s+)?sized\s+/i, "")
    .replace(/^store\s+bought\s+/i, "")
    .replace(/^(?:natural|unsalted|ripe)\s+/i, "")
    .trim();
  if (identity.length < 2 || identity.length > 60) return null;
  if (/^(?:mix|pieces?|item|ingredient)$/i.test(identity)) return null;
  if (/\d/.test(identity) || unresolvedRecipeNoise.test(identity)) return null;
  if (!/[a-z]{2}/i.test(identity)) return null;
  return identity;
}
