import { normaliseProductText } from "./product-normalisation";
import type { ProductClassification } from "./product-category";

const has = (text: string, terms: string[]) => terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
const result = (department: ProductClassification["department"], shelf: string, reason: string): ProductClassification => ({ department, shelf, confidence: "high", reason });

/**
 * High-specificity product identity guardrails learned from catalogue audits.
 * These run before generic ingredient/flavour heuristics. Return null when the
 * text does not provide enough identity evidence and let the normal classifier
 * continue.
 */
export function guardedProductIdentity(value: string): ProductClassification | null {
  const text = normaliseProductText(value);
  if (!text) return null;

  // Baby stage/age wording is stronger than rice/cereal/puff pantry words.
  if (has(text, ["baby mum mum", "little bellies", "little quacker"]) || /\b(?:4|6|8|10|12)\+?\s*months?\b/.test(text) || /\b1\s*-\s*3\s*years?\b/.test(text)) {
    if (has(text, ["rusk", "rusks", "puff", "puffs", "snack", "bar", "food", "puree", "custard"])) return result("Baby", "Baby food & care", "baby age/stage product identity");
  }

  // Personal-care brand + oil/soap wording must never fall through to food oil,
  // honey or herb rules.
  if (has(text, ["australian botanical soap", "aveeno", "argan hair", "body oil", "hair oil", "jojoba", "rosehip oil", "primrose oil"])) {
    return result("Health & personal care", "Health & personal care", "personal-care identity");
  }

  // Snack identity outranks flavour words such as honey, vinegar, cheddar,
  // chicken, salt and pepper.
  if (has(text, ["shapes", "cracker", "crackers", "cracker chips", "crispbread", "potato chips", "vege chips", "rice crackers", "corn chips"])) {
    return result("Pantry", "Snacks", "packaged savoury snack identity");
  }

  // Deli ham/mortadella identity outranks glaze/flavour words.
  if (has(text, ["leg ham", "virginian ham", "mortadella", "prosciutto", "salami", "charcuterie", "pate"])) {
    return result("Deli", "Deli meat & antipasto", "deli product identity");
  }

  // Fresh/prepared meat identity outranks marinades and sauces.
  if (has(text, ["chicken drumstick", "chicken wing", "chicken breast", "chicken thigh", "pork shoulder", "pork loin", "beef brisket", "beef roast", "lamb leg", "salmon fillet", "hoki fillet", "fish fillet"])) {
    return result("Meat & seafood", "Fresh meat & seafood", "meat or seafood product identity");
  }

  // A sauce is still a sauce even if the flavour contains meat names.
  if (has(text, ["simmer sauce", "pasta sauce", "curry sauce", "stir fry sauce", "marinade and sauce", "dipping sauce"])) {
    return result("Pantry", "Sauces & condiments", "sauce product identity");
  }

  // Shelf-stable/canned seafood identity outranks oil, pepper, lemon etc.
  if (has(text, ["tuna", "sardine", "sardines", "mackerel", "anchovy", "anchovies"]) && (has(text, ["chunks", "slices", "fillets in oil", "in oil", "in sauce"]) || /\b(?:50|90|95|105|125|185|400|425)g\b/.test(text))) {
    return result("Pantry", "Canned food, soups & noodles", "shelf-stable seafood identity");
  }

  // Baking/dessert mixes outrank ingredient words.
  if (has(text, ["muffin mix", "cake mix", "brownie mix", "cookie mix", "bread mix", "custard powder"])) {
    return result("Pantry", "Baking", "baking mix or ingredient identity");
  }

  return null;
}
