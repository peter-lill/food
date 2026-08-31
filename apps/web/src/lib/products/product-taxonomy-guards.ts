import { normaliseProductText } from "./product-normalisation";
import type { ProductClassification } from "./product-category";

const has = (text: string, terms: string[]) => terms.some((term) => {
  const normalisedTerm = normaliseProductText(term);
  if (!normalisedTerm) return false;
  return new RegExp(`\\b${normalisedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(text);
});
const result = (department: ProductClassification["department"], shelf: string | null, reason: string, confidence: ProductClassification["confidence"] = "high"): ProductClassification => ({ department, shelf, confidence, reason });

/** High-specificity identity guardrails. Product identity must beat flavour,
 * ingredient, serving suggestion, retailer shelf wording and modifier words. */
export function guardedProductIdentity(value: string): ProductClassification | null {
  const text = normaliseProductText(value);
  if (!text) return null;

  if (has(text, ["freezer bag", "freezer bags", "sandwich bag", "sandwich bags", "storage bag", "storage bags", "snack bags", "lunch bags", "oven bag", "oven bags", "resealable bag", "resealable bags", "upholstery stain remover", "cleaning wipes", "degreaser spray"])) return result("Household", "Food storage & household", "household storage/cleaning identity");
  if (has(text, ["car air freshener", "car cleaning wipes", "tyre shine", "tire shine", "tyre foam", "tire foam", "car wash", "wash & wax", "wash and wax"])) return result("Automotive", "Car care", "automotive product identity");
  if (has(text, ["bath towel", "bath mat", "hand towel", "beach towel"])) return result("Furniture & homewares", "Bathroom & homewares", "homewares product identity");
  if (has(text, ["beer glass", "beer glasses", "wine glass", "wine glasses", "champagne flute", "champagne flutes", "tumbler glass", "drinking glass", "drinking glasses"])) return result("Home, kitchen & appliances", "Drinkware", "drinkware product identity");
  if (has(text, ["electric salt and pepper mill", "electric salt & pepper mill", "salt and pepper mill", "salt & pepper mill", "kitchen timer", "cake tester", "crab cracker", "vegetable slicer", "poultry shears", "meat tenderiser", "melon baller", "skimmer tongs", "cutlery set"])) return result("Home, kitchen & appliances", "Kitchen tools & utensils", "kitchen tool identity");
  if (has(text, ["eyelash curler", "makeup blender", "facial razor", "makeup brush", "striplash adhesive", "lash adhesive"])) return result("Health & personal care", "Beauty tools & accessories", "beauty product identity");
  if (has(text, ["dog toy", "cat toy", "pet toy", "pee pads", "pet pads"])) return result("Pet", "Pet accessories & toys", "pet accessory identity");
  if (has(text, ["dog food", "puppy food", "cat food", "kitten food", "pet food", "dog treat", "cat treat", "dog biscuit", "cat litter", "litter freshener", "litter tray", "chilled dog food", "frozen dog food"])) return result("Pet", has(text, ["cat", "kitten"]) ? "Cat food & care" : has(text, ["dog", "puppy"]) ? "Dog food & care" : "Pet food & care", "pet product identity");

  if (has(text, ["conditioner", "shampoo", "body wash", "hand wash", "skin lotion", "moisturising lotion"])) return result("Health & personal care", "Health & personal care", "personal-care product identity");
  if (has(text, ["root beer"]) && has(text, ["soft drink", "soda"])) return result("Drinks", "Cold drinks", "non-alcoholic soft drink identity");
  if ((has(text, ["g&t", "gin and tonic", "gin & tonic"]) && has(text, ["non alcoholic", "non-alcoholic", "alcohol free", "zero alcohol"])) || has(text, ["non alcoholic g&t", "non-alcoholic g&t"])) return result("Drinks", "Low & no alcohol adult drinks", "non-alcoholic adult beverage identity");
  if (has(text, ["rice bowl", "noodle box", "tuna bowl", "meal kit"])) return result("Pantry", "Ready meals & meal kits", "prepared meal identity");
  if (has(text, ["spaghetti in tomato sauce", "canned spaghetti"])) return result("Pantry", "Canned food, soups & noodles", "canned meal identity");
  // Pizza is the product identity; words between a style cue and "pizza" are toppings.
  // This intentionally catches names such as "Stone Baked BBQ Chicken Pizza".
  if (has(text, ["pizza"]) && has(text, ["stone baked", "wood fired", "thin crust", "frozen"])) return result("Frozen", "Frozen meals & pizza", "pizza product identity");
  // Beer is a batter modifier here, not the product identity.
  if (has(text, ["beer batter", "beer battered"]) && has(text, ["fries", "shoestring fries", "steak cut chips", "chips"])) return result("Frozen", "Frozen food", "beer-battered frozen food identity");
  // Flavours and inclusions such as honey or fruit must not override yoghurt itself.
  if (has(text, ["yoghurt", "yogurt"])) return result("Dairy & eggs", "Yoghurt", "yoghurt product identity");
  // Tea is the beverage identity; honey, fruit and botanicals are flavour modifiers.
  if (has(text, ["green tea", "black tea", "iced tea", "ice tea"])) return result("Drinks", "Tea", "tea beverage identity");

  if (has(text, ["apple cider vinegar", "raw cider vinegar"]) && !has(text, ["gummies", "capsules", "conditioner", "shampoo"])) return result("Pantry", "Oils & vinegars", "culinary vinegar identity");

  if (has(text, ["bbq grill", "barbecue grill", "bbq cover", "barbecue cover", "bbq tool", "barbecue tool", "bbq utensil", "barbecue utensil"])) return result("Garden & outdoor", "Barbecues & outdoor cooking", "barbecue equipment identity");
  if (has(text, ["bbq rib glaze", "barbecue rib glaze", "bbq sauce", "barbecue sauce", "bbq marinade", "barbecue marinade", "bbq glaze", "barbecue glaze"]) && !has(text, ["whole chicken", "split chicken", "chicken drumstick", "chicken breast", "chicken thigh", "chicken wing", "beef brisket", "pork ribs", "pork shoulder", "lamb chops"])) return result("Pantry", "Sauces & condiments", "barbecue sauce or marinade identity");
  if (has(text, ["bbq seasoning", "barbecue seasoning", "bbq rub", "barbecue rub", "lamb rub"]) && !has(text, ["whole chicken", "chicken drumstick", "chicken drumsticks", "chicken breast", "chicken thigh", "chicken thighs", "pork ribs", "beef brisket"])) return result("Pantry", "Herbs & spices", "barbecue seasoning identity");
  const bbqMeat = has(text, ["bbq", "barbecue"]) && (
    has(text, ["whole chicken", "chicken drumstick", "chicken drumsticks", "chicken breast", "chicken thigh", "chicken thighs", "chicken wing", "chicken wings", "chicken kebab", "chicken kebabs", "beef kebab", "beef kebabs", "beef brisket", "beef jerky", "beef sausage", "beef sausages", "pork ribs", "pork shoulder", "lamb chop", "lamb chops", "sausages"])
    || (has(text, ["split"]) && has(text, ["chicken"]))
  );
  if (bbqMeat || has(text, ["bbq sausages", "barbecue sausages", "bbq pork ribs", "barbecue pork ribs", "bbq chicken", "barbecue chicken", "bbq beef", "barbecue beef", "pork ribs", "chicken wings", "beef brisket", "chicken kebab", "chicken kebabs", "beef kebab", "beef kebabs"])) return result("Meat & seafood", "Fresh meat & seafood", "barbecue meat identity");
  const bbqSnack = has(text, ["bbq", "barbecue"]) && has(text, ["chips", "crisps", "crackers", "noodle snacks", "snack mix", "potato chips"]);
  if (bbqSnack || has(text, ["bbq flavoured noodle snacks", "barbecue flavoured noodle snacks", "smokey bbq mix", "smoky bbq mix"])) return result("Pantry", "Snacks", "barbecue-flavoured snack identity");
  if (has(text, ["bbq", "barbecue"])) return result("Other", null, "ambiguous barbecue modifier requires stronger product identity", "low");

  if (has(text, ["liqueur cake", "rum cake", "amaretto cake"])) return result("Bakery", "Cakes & bakery", "cake product identity");
  if (has(text, ["air wick", "air freshener", "diffuser", "freshmatic", "automatic spray", "carpet fresh", "garbage bag", "bin liner", "cling wrap", "aluminium foil", "baking paper"])) return result("Household", "Cleaning & household", "household product identity");
  if (has(text, ["band aid", "band-aid", "first aid", "lip balm", "insect repellent", "sunscreen", "toothbrush", "toothpaste", "vinegar gummies"])) return result("Health & personal care", "Health & personal care", "personal-care product identity");
  if (has(text, ["australian botanical soap", "aveeno", "argan hair", "body oil", "hair oil", "jojoba", "rosehip oil", "primrose oil"])) return result("Health & personal care", "Health & personal care", "personal-care identity");

  const babyStage = /\b(?:4|6|8|10|12)\+?\s*months?\b/.test(text) || /\b1\s*(?:-|to|\s)\s*4\s*years?\b/.test(text);
  if ((has(text, ["baby mum mum", "little bellies", "little quacker", "annabel karmel little meals"]) || babyStage) && has(text, ["rusk", "rusks", "puff", "puffs", "snack", "bar", "food", "puree", "custard", "meal", "meals", "cereal", "pasta bake", "bolognese", "bolognaise"])) return result("Baby", "Baby food & care", "baby age/stage product identity");
  if (has(text, ["coca cola", "coca-cola", "coke", "pepsi", "sprite", "fanta"]) && has(text, ["zero sugar", "no sugar", "sugar free", "cola", "soft drink"])) return result("Drinks", "Cold drinks", "beverage brand/product identity");

  if (has(text, ["tuna", "sardine", "sardines", "mackerel", "anchovy", "anchovies", "herring fillet", "herring fillets", "smoked mussels", "smoked oysters"]) && (has(text, ["chunks", "slices", "fillets in oil", "in oil", "in vegetable oil", "in olive oil", "in sauce", "tomato sauce", "mustard sauce", "curry sauce", "mango pepper sauce"]) || /\bin\b.{0,32}\b(?:oil|sauce|springwater|brine)\b/.test(text) || /\b(?:50|85|90|95|105|110|125|185|190|200|400|415|425)g\b/.test(text))) return result("Pantry", "Canned food, soups & noodles", "shelf-stable seafood identity");
  if (has(text, ["cucumbers bread and butter", "cucumbers bread & butter", "bread and butter cucumbers", "bread & butter cucumbers", "stuffed olives", "pickled cucumber", "pickled cucumbers", "baby capers", "capers"])) return result("Pantry", "Pickled vegetables & condiments", "pickled vegetable identity");
  if (has(text, ["diced tomatoes", "crushed tomatoes", "whole peeled tomatoes", "tomatoes with paste", "tomato paste"])) return result("Pantry", "Canned food, soups & noodles", "canned tomato identity");
  if ((has(text, ["pineapple chunks", "pineapple slices", "pineapple pieces", "peach slices", "peaches sliced", "fruit salad", "two fruits"]) && has(text, ["in juice", "canned fruit", "tinned"])) || has(text, ["fruit in juice cups", "peaches in juice cups"])) return result("Pantry", "Canned food, soups & noodles", "canned fruit identity");
  if (has(text, ["birds eye"]) && (has(text, ["golden crunch", "deli seasoned chips", "crumbed hoki", "cheesy bakes"]) || has(text, ["sidewinders", "lattice"]))) return result("Frozen", "Frozen food", "frozen brand/product identity");

  const snackNGo = /\bsnack\s*['’]?\s*n\s*['’]?\s*go\b/i.test(text);
  if (snackNGo || has(text, ["breakfast biscuits", "custard creme biscuits", "custard crème biscuits", "arnotts shapes", "arnott's shapes", "vita weat", "cracker", "crackers", "cracker chips", "crispbread", "potato chips", "vege chips", "vege crisps", "lentil chips", "lentil crisps", "chickpea chips", "hummus chips", "corn chips", "rice crackers", "pea crisps", "pork crackle", "mixed nuts", "cereal bar", "cereal bars", "fruit filled bar", "fruit filled bars", "filled bars", "protein bar", "protein bars", "paleo bar", "tortilla strips"])) return result("Pantry", "Snacks", "packaged snack identity");
  if (has(text, ["muffin mix", "cake mix", "brownie mix", "cookie mix", "bread mix", "custard powder", "bread crumbs", "breadcrumbs", "panko bread crumbs", "bread improver", "cream of tartar", "egg replacer", "bread and pizza plain flour", "bread & pizza plain flour"])) return result("Pantry", "Baking", "baking mix or ingredient identity");
  if (has(text, ["muffins", "muffin 4 pack", "cinnamon scroll", "cinnamon scrolls", "bread", "breadsticks", "bread sticks", "bruschetta toasts", "toasts", "croissant", "brioche", "bagel", "bakery loaf"]) && !has(text, ["bread mix", "bread crumbs", "breadcrumbs", "bread flour", "pizza flour", "plain flour", "muffin mix", "improver"])) return result("Bakery", "Bread & bakery", "bakery product identity");
  if (has(text, ["chicken drumstick", "chicken drumsticks", "chicken wing", "chicken wings", "chicken breast", "chicken thigh", "chicken thighs", "chicken bites", "chicken burger", "chicken burgers", "pork shoulder", "pork loin", "pork ribs", "beef brisket", "beef roast", "beef soup bones", "beef sausage", "beef sausages", "honey beef sausages", "lamb leg", "lamb shank", "lamb shanks", "salmon fillet", "salmon fillets", "hoki fillet", "fish fillet", "prawn skewers", "prawn cutlets", "beef mince", "meatballs", "air dried venison", "biltong", "salt and pepper squid", "salt & pepper squid"]) && !has(text, ["recipe base", "meatball mould", "meatball mold"])) return result("Meat & seafood", "Fresh meat & seafood", "meat or seafood product identity");
  if (has(text, ["leg ham", "virginian ham", "mortadella", "prosciutto", "salami", "charcuterie", "pate", "gravlax", "gravalax"])) return result("Deli", "Deli meat & antipasto", "deli product identity");
  if (has(text, ["recipe base", "stock cube", "stock cubes", "stock powder", "liquid stock", "gravy granules", "gravy mix"])) return result("Pantry", "Stocks, gravy & recipe bases", "cooking-base identity");
  if (has(text, ["simmer sauce", "pasta sauce", "curry sauce", "stir fry sauce", "marinade and sauce", "dipping sauce", "black bean sauce", "stir fry paste", "curry paste", "rice paste"])) return result("Pantry", "Sauces & condiments", "sauce or cooking paste identity");
  if (has(text, ["olive oil spread", "canola spread", "buttery spread", "margarine spread"])) return result("Dairy & eggs", "Butter & margarine", "table spread identity");
  if (has(text, ["rice bran oil", "olive oil", "extra virgin olive oil", "canola oil", "vegetable oil", "sunflower oil", "sesame oil"]) && !has(text, ["breadstick", "breadsticks", "cracker", "crackers", "spread", "sardine", "sardines", "tuna", "anchovy", "anchovies", "mackerel", "toast", "toasts", "chips", "crisps"]) && !snackNGo) return result("Pantry", "Oils & vinegars", "culinary oil identity");
  if (has(text, ["pitted prunes", "dried prunes", "dried cranberries"])) return result("Pantry", "Snacks", "dried fruit identity");
  if (has(text, ["rice pudding", "dessert sauce", "flavoured topping", "fudge topping", "strawberry topping", "caramel topping", "maple flavoured syrup", "waffle cones", "waffle cone"])) return result("Pantry", "Desserts", "dessert product identity");

  return null;
}
