import { normaliseGroceryUnit, shoppingIdentity } from "@/lib/products/food-item-intelligence";

export type ShoppingOptimisationInput = {
  id: string;
  shoppingListId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
};

export type ShoppingOptimisationUpdate = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
};

type FulfilmentRule = {
  purchaseIdentity: string;
  derivedIdentities: ReadonlySet<string>;
  requiresExistingPurchase: boolean;
  equivalentPurchaseQuantity(item: ShoppingOptimisationInput): number;
};

const millilitresPerLemon = 45;
const teaspoonsRindPerLemon = 2;

function positiveQuantity(item: ShoppingOptimisationInput) {
  return item.quantity !== null && Number.isFinite(item.quantity) && item.quantity > 0
    ? item.quantity
    : 1;
}

function lemonJuiceEquivalent(item: ShoppingOptimisationInput) {
  const quantity = positiveQuantity(item);
  const unit = normaliseGroceryUnit(item.unit);

  if (unit === "mL") return Math.max(1, Math.ceil(quantity / millilitresPerLemon));
  if (unit === "L") return Math.max(1, Math.ceil((quantity * 1000) / millilitresPerLemon));

  const rawUnit = (item.unit ?? "").toLocaleLowerCase("en-AU").trim();
  if (["tbsp", "tablespoon", "tablespoons"].includes(rawUnit)) {
    return Math.max(1, Math.ceil((quantity * 15) / millilitresPerLemon));
  }
  if (["tsp", "teaspoon", "teaspoons"].includes(rawUnit)) {
    return Math.max(1, Math.ceil((quantity * 5) / millilitresPerLemon));
  }
  if (["cup", "cups"].includes(rawUnit)) {
    return Math.max(1, Math.ceil((quantity * 250) / millilitresPerLemon));
  }

  return Math.max(1, Math.ceil(quantity));
}

function lemonRindEquivalent(item: ShoppingOptimisationInput) {
  const quantity = positiveQuantity(item);
  const rawUnit = (item.unit ?? "").toLocaleLowerCase("en-AU").trim();

  if (["tbsp", "tablespoon", "tablespoons"].includes(rawUnit)) {
    return Math.max(1, Math.ceil((quantity * 3) / teaspoonsRindPerLemon));
  }
  if (["tsp", "teaspoon", "teaspoons"].includes(rawUnit)) {
    return Math.max(1, Math.ceil(quantity / teaspoonsRindPerLemon));
  }

  return Math.max(1, Math.ceil(quantity));
}

const fulfilmentRules: FulfilmentRule[] = [
  {
    purchaseIdentity: "lemon",
    derivedIdentities: new Set(["lemon juice"]),
    requiresExistingPurchase: true,
    equivalentPurchaseQuantity: lemonJuiceEquivalent,
  },
  {
    purchaseIdentity: "lemon",
    derivedIdentities: new Set(["lemon rind", "lemon zest"]),
    requiresExistingPurchase: true,
    equivalentPurchaseQuantity: lemonRindEquivalent,
  },
];

/**
 * Converts ingredient-shaped shopping requests into the smallest sensible set
 * of purchases. It deliberately preserves standalone derived products unless a
 * compatible source purchase already exists on the same list.
 */
export function optimiseShoppingFulfilment(
  items: ShoppingOptimisationInput[],
): ShoppingOptimisationUpdate[] {
  const identitiesByList = new Map<string, Set<string>>();

  for (const item of items) {
    const identities = identitiesByList.get(item.shoppingListId) ?? new Set<string>();
    identities.add(shoppingIdentity(item.name));
    identitiesByList.set(item.shoppingListId, identities);
  }

  const updates: ShoppingOptimisationUpdate[] = [];

  for (const item of items) {
    const identity = shoppingIdentity(item.name);
    const availableIdentities = identitiesByList.get(item.shoppingListId) ?? new Set<string>();

    const rule = fulfilmentRules.find((candidate) => (
      candidate.derivedIdentities.has(identity)
      && (!candidate.requiresExistingPurchase || availableIdentities.has(candidate.purchaseIdentity))
    ));

    if (!rule) continue;

    updates.push({
      id: item.id,
      name: rule.purchaseIdentity,
      quantity: rule.equivalentPurchaseQuantity(item),
      unit: "each",
    });
  }

  return updates;
}
