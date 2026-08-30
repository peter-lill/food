import { normaliseProductText } from "./product-normalisation";
import type { ProductClassification } from "./product-category";

const has = (text: string, terms: string[]) => terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
const result = (department: ProductClassification["department"], shelf: string, reason: string): ProductClassification => ({ department, shelf, confidence: "high", reason });

/** High-specificity identity guardrails. Product identity must beat flavour,
 * ingredient, serving suggestion and modifier words. */
export function guardedProductIdentity(value: string): ProductClassification | null {
  const text = normaliseProductText(value);
  if (!text) return null;

  // Non-food identities always beat food-like scent/ingredient words.
  if (has(text, ["air wick", "air freshener", "diffuser", "freshmatic", "automatic spray", "carpet fresh", "garbage bag", "bin liner", "cling wrap", "aluminium foil", "baking paper"]))
    return result("Household", "Cleaning & household", "household product identity");
  if (has(text, ["band aid", "band-aid", "first aid", "lip balm", "insect repellent", "sunscreen", "toothbrush", "toothpaste", "shampoo", "conditioner", "body wash", "hand wash", "skin lotion", "moisturising lotion", "vinegar gummies"]))
    return result("Health & personal care", "Health & personal care", "personal-care product identity");
  if (has(text, ["australian botanical soap", "aveeno", "argan hair", "body oil", "hair oil", "jojoba", "rosehip oil", "primrose oil"]))
    return result("Health & personal care", "Health & personal care", "personal-care identity");

  // Pet identity must beat meat, rice and vegetable ingredient words.
  if (has(text, ["puppy food", "dog food", "cat food", "kitten food", "pet food", "dog treat", "cat treat", "dog biscuit", "cat litter", "litter freshener", "litter tray"]))
    return result("Pet", has(text, ["cat", "kitten"]) ? "Cat food & care" : has(text, ["dog", "puppy"]) ? "Dog food & care" : "Pet food & care", "pet product identity");

  const babyStage = /\b(?:4|6|8|10|12)\+?\s*months?\b/.test(text) || /\b1\s*(?:-|to|\s)\s*4\s*years?\b/.test(text);
  if (has(text, ["baby mum mum", "little bellies", "little quacker", "annabel karmel little meals"]) || babyStage) {
    if (has(text, ["rusk", "rusks", "puff", "puffs", "snack", "bar", "food", "puree", "custard", "meal", "meals", "cereal", "pasta bake", "bolognese", "bolognaise"])) return result("Baby", "Baby food & care", "baby age/stage product identity");
  }

  if (has(text, ["coca cola", "coca-cola", "coke", "pepsi", "sprite", "fanta"]) && has(text, ["zero sugar", "no sugar", "sugar free", "cola", "soft drink"]))
    return result("Drinks", "Cold drinks", "beverage brand/product identity");

  // Canned/pouched seafood identity must beat its packing sauce, oil or seasoning.
  if (has(text, ["tuna", "sardine", "sardines", "mackerel", "anchovy", "anchovies", "herring fillet", "herring fillets", "smoked mussels", "smoked oysters"]) && (has(text, ["chunks", "slices", "fillets in oil", "in oil", "in vegetable oil", "in olive oil", "in sauce", "tomato sauce", "mustard sauce", "curry sauce", "mango pepper sauce", "bbq sauce"]) || /\bin\b.{0,32}\b(?:oil|sauce|springwater|brine)\b/.test(text) || /\b(?:50|85|90|95|105|110|125|185|200|400|415|425)g\b/.test(text)))
    return result("Pantry", "Canned food, soups & noodles", "shelf-stable seafood identity");

  if (has(text, ["cucumbers bread and butter", "cucumbers bread & butter", "bread and butter cucumbers", "bread & butter cucumbers", "stuffed olives", "pickled cucumber", "pickled cucumbers", "baby capers", "capers"]))
    return result("Pantry", "Pickled vegetables & condiments", "pickled vegetable identity");

  if (has(text, ["diced tomatoes", "crushed tomatoes", "whole peeled tomatoes", "tomatoes with paste", "tomato paste"]))
    return result("Pantry", "Canned food, soups & noodles", "canned tomato identity");
  if ((has(text, ["pineapple chunks", "pineapple slices", "pineapple pieces", "peach slices", "peaches sliced", "fruit salad", "two fruits"]) && has(text, ["in juice", "canned fruit", "tinned"])) || has(text, ["fruit in juice cups", "peaches in juice cups"]))
    return result("Pantry", "Canned food, soups & noodles", "canned fruit identity");

  // Finished snacks and bars must beat flavour/ingredient words such as honey,
  // cinnamon, lentil, chickpea, olive oil and salt.
  if (has(text, ["breakfast biscuits", "custard creme biscuits", "custard crème biscuits", "arnotts shapes", "arnott's shapes", "vita weat", "cracker", "crackers", "cracker chips", "crispbread", "potato chips", "vege chips", "lentil chips", "chickpea chips", "hummus chips", "corn chips", "rice crackers", "pea crisps", "pork crackle", "mixed nuts", "cereal bar", "cereal bars", "fruit filled bar", "fruit filled bars", "filled bars", "protein bar", "protein bars", "paleo bar", "snack'n'go"]))
    return result("Pantry", "Snacks", "packaged snack identity");

  // Baking mixes/ingredients before finished bakery words.
  if (has(text, ["muffin mix", "cake mix", "brownie mix", "cookie mix", "bread mix", "custard powder", "bread crumbs", "breadcrumbs", "panko bread crumbs", "bread improver", "cream of tartar", "egg replacer", "bread and pizza plain flour", "bread & pizza plain flour"]))
    return result("Pantry", "Baking", "baking mix or ingredient identity");

  if (has(text, ["muffins", "muffin 4 pack", "cinnamon scroll", "cinnamon scrolls", "bread", "breadsticks", "bread sticks", "bruschetta toasts", "toasts", "croissant", "brioche", "bagel", "bakery loaf"]) && !has(text, ["bread mix", "bread crumbs", "breadcrumbs", "bread flour", "pizza flour", "plain flour", "muffin mix", "improver"]))
    return result("Bakery", "Bread & bakery", "bakery product identity");

  // Prepared/fresh meat identity before honey, gravy, sauce or seasoning words.
  if (has(text, ["chicken drumstick", "chicken drumsticks", "chicken wing", "chicken wings", "chicken breast", "chicken thigh", "chicken thighs", "chicken bites", "chicken burger", "chicken burgers", "pork shoulder", "pork loin", "beef brisket", "beef roast", "beef soup bones", "beef sausage", "beef sausages", "honey beef sausages", "lamb leg", "lamb shank", "lamb shanks", "salmon fillet", "salmon fillets", "hoki fillet", "fish fillet", "prawn skewers", "prawn cutlets", "beef mince", "meatballs", "air dried venison", "biltong", "salt and pepper squid", "salt & pepper squid"]) && !has(text, ["recipe base", "meatball mould", "meatball mold"]))
    return result("Meat & seafood", "Fresh meat & seafood", "meat or seafood product identity");

  if (has(text, ["leg ham", "virginian ham", "mortadella", "prosciutto", "salami", "charcuterie", "pate"]))
    return result("Deli", "Deli meat & antipasto", "deli product identity");

  if (has(text, ["recipe base", "stock cube", "stock cubes", "stock powder", "liquid stock", "gravy granules", "gravy mix"]))
    return result("Pantry", "Stocks, gravy & recipe bases", "cooking-base identity");
  if (has(text, ["simmer sauce", "pasta sauce", "curry sauce", "stir fry sauce", "marinade and sauce", "dipping sauce", "black bean sauce", "stir fry paste", "curry paste", "rice paste"]))
    return result("Pantry", "Sauces & condiments", "sauce or cooking paste identity");

  // Known freezer range identity beats generic chips/rice/seafood words.
  if (has(text, ["birds eye"]) && has(text, ["chips", "crinkles", "sidewinders", "lattice", "crumbed hoki", "cheesy bakes"]))
    return result("Frozen", "Frozen food", "frozen brand/product identity");

  // Oil spreads are spreads/margarine, not bottles of culinary oil.
  if (has(text, ["olive oil spread", "canola spread", "buttery spread", "margarine spread"]))
    return result("Dairy & eggs", "Butter & margarine", "table spread identity");
  if (has(text, ["rice bran oil", "olive oil", "extra virgin olive oil", "canola oil", "vegetable oil", "sunflower oil", "sesame oil"]) && !has(text, ["breadstick", "breadsticks", "cracker", "crackers", "spread", "sardine", "sardines", "tuna", "anchovy", "anchovies", "mackerel", "toast", "toasts", "snack'n'go", "chips", "crisps"]))
    return result("Pantry", "Oils & vinegars", "culinary oil identity");

  if (has(text, ["pitted prunes", "dried prunes", "dried cranberries"]))
    return result("Pantry", "Snacks", "dried fruit identity");

  if (has(text, ["rice pudding", "dessert sauce", "flavoured topping", "fudge topping", "strawberry topping", "maple flavoured syrup", "waffle cones", "waffle cone"]))
    return result("Pantry", "Desserts", "dessert product identity");

  return null;
}
