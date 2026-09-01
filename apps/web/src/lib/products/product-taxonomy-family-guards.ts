import { normaliseProductText } from "./product-normalisation";
import type { ProductClassification } from "./product-category";

const has = (text: string, terms: string[]) => terms.some((term) => {
  const normalisedTerm = normaliseProductText(term);
  if (!normalisedTerm) return false;
  return new RegExp(`\\b${normalisedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(text);
});

const result = (department: ProductClassification["department"], shelf: string | null, reason: string): ProductClassification => ({ department, shelf, confidence: "high", reason });

/**
 * Conservative retail-wide family rules derived from the whole-catalogue audit.
 * These rules intentionally use explicit product nouns/forms rather than retailer
 * departments or loose ingredient/flavour words so they remain safe for bulk imports.
 */
export function guardedProductFamily(value: string): ProductClassification | null {
  const text = normaliseProductText(value);
  if (!text) return null;

  // Office and stationery.
  if (has(text, ["ballpoint pen", "ball point pen", "gel ink pen", "retractable pen", "colour pens", "color pens", "highlighter", "pencils with eraser", "colour pencils", "color pencils", "felt markers", "crayons", "glue stick", "correction tape", "correction fluid", "correction pen", "white out", "wite out"])) return result("Office & stationery", "Stationery", "stationery product family");

  // Health, beauty and personal care.
  if (has(text, ["disposable razor", "razor cartridges", "dental floss", "floss picks", "mouthwash", "antiseptic liquid", "antiseptic ointment", "sore throat gargle", "paracetamol", "pain relief gel", "petroleum jelly", "pimple patches", "cleansing wipes", "blood pressure monitor", "earplugs"])) return result("Health & personal care", "Health & personal care", "health/personal-care product family");

  // Household cleaning, laundry and storage.
  if (has(text, ["disinfectant wipes", "disinfectant liquid", "laundry liquid", "laundry powder", "laundry sanitiser", "fabric softener", "stain remover", "dish capsules", "dishwashing capsules", "garbage bags", "drawstring garbage bags", "laundry basket", "paper towels", "facial tissues", "toilet tissue", "washing aids"])) return result("Household", "Cleaning & household", "household product family");

  // Electronics and technology.
  if (has(text, ["usb a to lightning cable", "usb a to usb c cable", "usb c to usb c cable", "charging stand", "portable charging accessories", "portable charging assortment", "digital radio", "robot vacuum"])) return result("Electronics & technology", "Electronics & technology", "electronics product family");

  // Home, kitchen and appliances.
  if (has(text, ["wooden kitchen tools", "wood utensils", "wooden utensils", "cutting board", "cutting boards", "measuring cup", "kitchen gadgets", "meal prep container", "vacuum sealer bags", "pizza making set", "pizza serving set", "pot protectors"])) return result("Home, kitchen & appliances", "Kitchen tools & utensils", "kitchen/home product family");

  // Garden/outdoor and tools.
  if (has(text, ["petrol mower", "walk in greenhouse", "garden gloves", "plant stick set"])) return result("Garden & outdoor", "Garden & outdoor", "garden/outdoor product family");
  if (has(text, ["workshop trolley", "workshop stool", "tool set", "socket set", "screwdriver set"])) return result("Tools & hardware", "Tools & hardware", "tools/hardware product family");

  // Clothing, sport and recreation.
  if (has(text, ["compression tights", "running tight", "running tights", "fitness tops", "fitness top", "travel clothing set", "comfort insoles", "orthotics"])) return result("Clothing, footwear & accessories", "Clothing & footwear", "clothing/footwear product family");
  if (has(text, ["fitness bands", "yoga cushion", "yoga equipment", "dartboard set", "posture trainer", "massage boots"])) return result("Sport, fitness & recreation", "Sport & fitness", "sport/fitness product family");

  // Toys, books and entertainment.
  if (has(text, ["picture books", "picture sound books", "storybook", "storybooks", "flip books", "felt books", "science sets", "science set", "die cast figures", "cookbook"])) return result("Toys, games & entertainment", "Toys & games", "toy/book/entertainment product family");

  // Pet products.
  if (has(text, ["dog harness", "retractable lead", "rope lead", "dentastix", "marrobones", "dog meaty bites", "pet mince"])) return result("Pet", has(text, ["dog", "dentastix", "marrobones"]) ? "Dog food & care" : "Pet food & care", "pet product family");

  // Drinks. Brand rules are intentionally limited to established beverage identities.
  if (has(text, ["7-up", "7 up", "pepsi max", "bickfords traditional soda"])) return result("Drinks", "Cold drinks", "soft-drink product family");
  if (has(text, ["hot choc sachets", "hot chocolate sachets"])) return result("Drinks", "Coffee & tea", "hot beverage product family");

  // Alcohol. Explicit beverage forms only; product modifiers such as beer-battered are handled earlier.
  if (has(text, ["pinot grigio", "pinot gris", "moscato", "riesling", "malbec reserva", "weissbier"]) && !has(text, ["zero alcohol", "non alcoholic", "non-alcoholic", "alcohol free", "0.0%", "0%"])) return result("Beer, wine & spirits", "Beer, wine & spirits", "alcohol beverage product family");

  // Fresh produce. Require recognisable fresh forms and avoid canned/preserved wording.
  if (!has(text, ["in syrup", "in juice", "pickled", "dried", "flakes", "flavour", "flavored", "flavoured"])) {
    if (has(text, ["nectarines loose", "grapes loose", "potatoes loose", "mandarins loose", "apples loose", "mushrooms 200g", "mushrooms 375g", "mushrooms 500g", "cucumbers loose", "lemons 5 pack", "pineapple each", "passionfruit 6 pack", "capsicums each", "tomatoes 250g"])) return result("Fruit & vegetables", "Fresh produce", "fresh produce product family");
  }

  // Dairy and chilled.
  if (has(text, ["danish style fetta", "persian fetta", "marinated fetta", "red leicester", "maasdam portion"])) return result("Dairy & eggs", "Cheese", "cheese product family");
  if (has(text, ["creme caramel", "crème caramel"])) return result("Dairy & eggs", "Chilled desserts", "chilled dessert product family");

  // Bakery forms. Explicit forms beat ingredient/flavour words.
  if (has(text, ["sourdough", "bagels", "bagel", "croissants", "croissant", "crumpets", "crumpet", "baguette", "bread rolls", "white loaf", "wholemeal loaf", "cob loaf", "vienna sourdough"])) return result("Bakery", "Bread & bakery", "bakery product family");
  if (has(text, ["fruit cake", "madeira cake", "belgian waffles", "viennese style fingers"])) return result("Bakery", "Cakes & bakery", "bakery sweet product family");

  // Meat, seafood and deli. Product cuts/forms must beat recipe or flavour words.
  if (!has(text, ["recipe base", "stock", "sauce"])) {
    if (has(text, ["beef rissoles", "beef scotch fillet", "beef stir fry strips", "beef topside roast", "wagyu beef burgers", "wagyu beef burger", "veal schnitzel", "pork belly", "pork fillet", "pork leg roast", "pork sausages", "pork scotch fillet roast", "crumbed pork schnitzels", "marinated chicken roasting pieces", "chicken tenders", "duck breast", "marinara mix"])) return result("Meat & seafood", "Fresh meat & seafood", "meat/seafood product family");
  }
  if (has(text, ["pastrami sliced", "devon sliced", "pepperoni sliced", "kransky", "frankfurts", "pancetta", "sopressa", "sliced bacon", "diced bacon pieces"])) return result("Deli", "Deli meat & antipasto", "deli product family");

  // Frozen product forms where the noun strongly implies freezer placement.
  if (has(text, ["crispy battered fish fillets", "tempura battered fish fillets", "crumbed calamari rings", "party pies", "party sausage rolls", "party quiches", "vegetable gyoza", "pork dumplings", "frozen peas", "peas & corn 1kg", "peas corn & carrots", "peas carrots & super sweet corn"])) return result("Frozen", "Frozen food", "frozen product family");
  if (has(text, ["pepperoni pizza", "margherita pizza", "meat lovers family pizza", "diavola pizza"])) return result("Frozen", "Frozen meals & pizza", "pizza product family");

  // Pantry staples, canned foods and condiments.
  if (has(text, ["4 bean mix", "lentils 420g", "whole champignons 425g", "pineapple chunks 432g", "pineapple slices 432g", "peach slices in syrup", "lychees in syrup", "pitted black cherries in syrup"])) return result("Pantry", "Canned food, soups & noodles", "canned pantry product family");
  if (has(text, ["cous cous", "couscous", "pearl barley", "spaghetti", "hokkien style noodles", "singapore style noodles", "udon noodles", "pho bowl", "noodle bowl"])) return result("Pantry", "Pasta, rice & grains", "pantry staple product family");
  if (has(text, ["parsley flakes", "crushed chilli", "all purpose seasoning"])) return result("Pantry", "Herbs & spices", "herb/spice product family");
  if (has(text, ["pickled onions", "pickled brown onions", "white pickled onions", "marinated split green olives"])) return result("Pantry", "Pickled vegetables & condiments", "pickled condiment product family");
  if (has(text, ["vanilla extract", "desiccated coconut", "bi-carb soda", "bicarb soda", "cupcake mix"])) return result("Pantry", "Baking", "baking product family");
  if (has(text, ["tahini spread", "vegemite"])) return result("Pantry", "Jams, honey & spreads", "spread product family");
  if (has(text, ["pine nuts", "pecans", "walnuts", "macadamias", "pepitas", "hazelnuts"])) return result("Pantry", "Snacks", "nuts/seeds product family");

  // Confectionery and biscuits.
  if (has(text, ["m&ms", "m&m's", "liquorice twists", "marshmallows", "chewy mints", "sugar free mints", "musk stix", "party mix"])) return result("Confectionery", "Confectionery", "confectionery product family");
  if (has(text, ["digestives biscuits", "maria biscuits", "wafer rolls", "wafers gluten free", "crème wafers", "creme wafers"])) return result("Confectionery", "Biscuits & cookies", "biscuit/wafer product family");

  return null;
}
