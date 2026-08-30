import { normaliseProductText } from "./product-normalisation";
import type { ProductClassification } from "./product-category";

const has = (text: string, terms: string[]) => terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
const result = (department: ProductClassification["department"], shelf: string, reason: string): ProductClassification => ({ department, shelf, confidence: "high", reason });

/** High-specificity identity guardrails. Product identity must beat flavour,
 * ingredient, serving suggestion and modifier words. */
export function guardedProductIdentity(value: string): ProductClassification | null {
  const text = normaliseProductText(value);
  if (!text) return null;

  if (has(text, ["band aid", "band-aid", "first aid", "lip balm", "insect repellent", "sunscreen", "toothbrush", "toothpaste", "shampoo", "conditioner", "body wash", "hand wash", "skin lotion", "moisturising lotion", "vinegar gummies"]))
    return result("Health & personal care", "Health & personal care", "personal-care product identity");
  if (has(text, ["australian botanical soap", "aveeno", "argan hair", "body oil", "hair oil", "jojoba", "rosehip oil", "primrose oil"]))
    return result("Health & personal care", "Health & personal care", "personal-care identity");

  // Normalisation may turn "1-4 years" into "1 4 years", so accept either
  // punctuation or whitespace between stage numbers.
  const babyStage = /\b(?:4|6|8|10|12)\+?\s*months?\b/.test(text)
    || /\b1\s*(?:-|to|\s)\s*4\s*years?\b/.test(text);
  if (has(text, ["baby mum mum", "little bellies", "little quacker", "annabel karmel little meals"]) || babyStage) {
    if (has(text, ["rusk", "rusks", "puff", "puffs", "snack", "bar", "food", "puree", "custard", "meal", "meals", "cereal", "pasta bake", "bolognese", "bolognaise"])) return result("Baby", "Baby food & care", "baby age/stage product identity");
  }

  // Shelf-stable/canned seafood must precede culinary oils. Packing medium is
  // not the product identity, including phrases such as "in extra virgin oil".
  if (has(text, ["tuna", "sardine", "sardines", "mackerel", "anchovy", "anchovies"]) && (has(text, ["chunks", "slices", "fillets in oil", "in oil", "in vegetable oil", "in olive oil", "in sauce", "tomato sauce"]) || /\bin\b.{0,32}\boil\b/.test(text) || /\b(?:50|90|95|105|110|125|185|400|415|425)g\b/.test(text)))
    return result("Pantry", "Canned food, soups & noodles", "shelf-stable seafood identity");

  if (has(text, ["cucumbers bread and butter", "cucumbers bread & butter", "bread and butter cucumbers", "bread & butter cucumbers", "stuffed olives", "pickled cucumber", "pickled cucumbers"]))
    return result("Pantry", "Pickled vegetables & condiments", "pickled vegetable identity");

  // Canned tomato identity before herb/spice flavour words.
  if (has(text, ["diced tomatoes", "crushed tomatoes", "whole peeled tomatoes", "tomatoes with paste", "tomato paste"]))
    return result("Pantry", "Canned food, soups & noodles", "canned tomato identity");

  if (has(text, ["muffins", "muffin 4 pack", "bread", "breadsticks", "bread sticks", "bruschetta toasts", "toasts", "croissant", "brioche", "bagel", "bakery loaf"]) && !has(text, ["bread mix", "bread crumbs", "breadcrumbs", "bread flour", "pizza flour", "plain flour", "muffin mix"]))
    return result("Bakery", "Bread & bakery", "bakery product identity");

  if (has(text, ["chicken drumstick", "chicken drumsticks", "chicken wing", "chicken wings", "chicken breast", "chicken thigh", "chicken thighs", "chicken bites", "pork shoulder", "pork loin", "beef brisket", "beef roast", "beef soup bones", "lamb leg", "salmon fillet", "salmon fillets", "hoki fillet", "fish fillet", "prawn skewers", "prawn cutlets", "beef mince", "meatballs", "air dried venison", "salt and pepper squid", "salt & pepper squid"]))
    return result("Meat & seafood", "Fresh meat & seafood", "meat or seafood product identity");

  if (has(text, ["leg ham", "virginian ham", "mortadella", "prosciutto", "salami", "charcuterie", "pate"]))
    return result("Deli", "Deli meat & antipasto", "deli product identity");

  if (has(text, ["muffin mix", "cake mix", "brownie mix", "cookie mix", "bread mix", "custard powder", "bread and pizza plain flour", "bread & pizza plain flour"]))
    return result("Pantry", "Baking", "baking mix or ingredient identity");

  if (has(text, ["simmer sauce", "pasta sauce", "curry sauce", "stir fry sauce", "marinade and sauce", "dipping sauce", "black bean sauce"]))
    return result("Pantry", "Sauces & condiments", "sauce product identity");

  // Birds Eye freezer identity must run before generic chips/snack matching.
  if (has(text, ["birds eye"]) && has(text, ["chips", "crinkles", "sidewinders", "lattice", "crumbed hoki", "cheesy bakes"]))
    return result("Frozen", "Frozen food", "frozen brand/product identity");

  if (has(text, ["breakfast biscuits", "custard creme biscuits", "custard crème biscuits", "arnotts shapes", "arnott's shapes", "cracker", "crackers", "cracker chips", "crispbread", "potato chips", "vege chips", "rice crackers", "corn chips", "pea crisps"]))
    return result("Pantry", "Snacks", "packaged snack identity");

  if (has(text, ["rice bran oil", "olive oil", "extra virgin olive oil", "canola oil", "vegetable oil", "sunflower oil", "sesame oil"]) && !has(text, ["breadstick", "breadsticks", "cracker", "crackers", "spread", "sardine", "sardines", "tuna", "anchovy", "anchovies", "mackerel", "toast", "toasts"]))
    return result("Pantry", "Oils & vinegars", "culinary oil identity");

  if (has(text, ["fruit salad in juice", "peach slices in juice", "peaches in juice", "two fruits in juice", "fruit in juice cups", "peaches in juice cups"]))
    return result("Pantry", "Canned food, soups & noodles", "canned fruit identity");

  if (has(text, ["pitted prunes", "dried prunes", "dried cranberries"]))
    return result("Pantry", "Snacks", "dried fruit identity");

  if (has(text, ["dessert sauce", "flavoured topping", "fudge topping", "strawberry topping", "maple flavoured syrup", "waffle cones", "waffle cone"]))
    return result("Pantry", "Desserts", "shelf-stable dessert product identity");

  return null;
}
