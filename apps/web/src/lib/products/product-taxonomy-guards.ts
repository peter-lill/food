import { normaliseProductText } from "./product-normalisation";
import type { ProductClassification } from "./product-category";

const has = (text: string, terms: string[]) => terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
const result = (department: ProductClassification["department"], shelf: string, reason: string): ProductClassification => ({ department, shelf, confidence: "high", reason });

/** High-specificity identity guardrails. Product identity must beat flavour,
 * ingredient, serving suggestion and modifier words. */
export function guardedProductIdentity(value: string): ProductClassification | null {
  const text = normaliseProductText(value);
  if (!text) return null;

  // Non-food identity first. "Shapes" must not make Band-Aid a snack.
  if (has(text, ["band aid", "band-aid", "first aid", "lip balm", "insect repellent", "sunscreen", "toothbrush", "toothpaste", "shampoo", "conditioner", "body wash", "hand wash", "skin lotion", "moisturising lotion"]))
    return result("Health & personal care", "Health & personal care", "personal-care product identity");
  if (has(text, ["australian botanical soap", "aveeno", "argan hair", "body oil", "hair oil", "jojoba", "rosehip oil", "primrose oil"]))
    return result("Health & personal care", "Health & personal care", "personal-care identity");

  // Baby stage/age wording is stronger than rice/cereal/puff pantry words.
  if (has(text, ["baby mum mum", "little bellies", "little quacker"]) || /\b(?:4|6|8|10|12)\+?\s*months?\b/.test(text) || /\b1\s*-\s*4\s*years?\b/.test(text)) {
    if (has(text, ["rusk", "rusks", "puff", "puffs", "snack", "bar", "food", "puree", "custard", "meal", "cereal"])) return result("Baby", "Baby food & care", "baby age/stage product identity");
  }

  // Bakery identity before grains, herbs, salt, cheese and oil modifiers.
  if (has(text, ["bread", "breadsticks", "bread sticks", "croissant", "brioche", "bagel", "bakery loaf"]) && !has(text, ["bread mix", "bread crumbs", "breadcrumbs"]))
    return result("Bakery", "Bread & bakery", "bakery product identity");

  // Fresh/prepared meat identity before honey, soy, mayonnaise and sauce.
  if (has(text, ["chicken drumstick", "chicken drumsticks", "chicken wing", "chicken wings", "chicken breast", "chicken thigh", "chicken thighs", "chicken bites", "pork shoulder", "pork loin", "beef brisket", "beef roast", "lamb leg", "salmon fillet", "salmon fillets", "hoki fillet", "fish fillet", "prawn skewers", "beef mince"]))
    return result("Meat & seafood", "Fresh meat & seafood", "meat or seafood product identity");

  // Deli identity before honey, pepper, cheese and pizza modifiers.
  if (has(text, ["leg ham", "virginian ham", "mortadella", "prosciutto", "salami", "charcuterie", "pate"]))
    return result("Deli", "Deli meat & antipasto", "deli product identity");

  // Shelf-stable seafood before sauce/oil/flavour words.
  if (has(text, ["tuna", "sardine", "sardines", "mackerel", "anchovy", "anchovies"]) && (has(text, ["chunks", "slices", "fillets in oil", "in oil", "in sauce", "tomato sauce"]) || /\b(?:50|90|95|105|125|185|400|425)g\b/.test(text)))
    return result("Pantry", "Canned food, soups & noodles", "shelf-stable seafood identity");

  // Baking mixes before fruit/spice/bread identities.
  if (has(text, ["muffin mix", "cake mix", "brownie mix", "cookie mix", "bread mix", "custard powder"]))
    return result("Pantry", "Baking", "baking mix or ingredient identity");

  // Sauce identity before meat/rice/bean/honey ingredient words.
  if (has(text, ["simmer sauce", "pasta sauce", "curry sauce", "stir fry sauce", "marinade and sauce", "dipping sauce", "black bean sauce"]))
    return result("Pantry", "Sauces & condiments", "sauce product identity");

  // Snack identity after non-food/bakery/meat guards. Require actual snack form;
  // never classify arbitrary products merely because their name contains Shapes.
  if (has(text, ["arnotts shapes", "arnott's shapes", "cracker", "crackers", "cracker chips", "crispbread", "potato chips", "vege chips", "rice crackers", "corn chips", "pea crisps"]))
    return result("Pantry", "Snacks", "packaged savoury snack identity");

  // Prepared frozen potato/fish products are commonly missing the word frozen.
  if (has(text, ["birds eye"]) && has(text, ["chips", "crinkles", "sidewinders", "crumbed hoki", "cheesy bakes"]))
    return result("Frozen", "Frozen food", "frozen brand/product identity");

  // Culinary oil identity must beat rice/bran/olive ingredient tokens.
  if (has(text, ["rice bran oil", "olive oil", "extra virgin olive oil", "canola oil", "vegetable oil", "sunflower oil", "sesame oil"]) && !has(text, ["breadstick", "breadsticks", "cracker", "crackers", "spread"]))
    return result("Pantry", "Oils & vinegars", "culinary oil identity");

  // Fruit packed in juice is canned fruit, not a beverage.
  if (has(text, ["fruit salad in juice", "peach slices in juice", "peaches in juice", "two fruits in juice", "fruit in juice cups", "peaches in juice cups"]))
    return result("Pantry", "Canned food, soups & noodles", "canned fruit identity");

  // Dessert toppings/syrups/cones are pantry products unless retailer taxonomy
  // explicitly says frozen; words such as sundae/waffle must not imply freezer.
  if (has(text, ["dessert sauce", "flavoured topping", "fudge topping", "strawberry topping", "maple flavoured syrup", "waffle cones", "waffle cone"]))
    return result("Pantry", "Desserts", "shelf-stable dessert product identity");

  return null;
}
