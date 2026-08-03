export type GroceryConcept = {
  canonicalName: string;
  aliases: string[];
  family: string;
  preservePhrase: boolean;
};

const concepts: GroceryConcept[] = [
  { canonicalName: "Green Apple", aliases: ["green apple", "green apples"], family: "Apple", preservePhrase: true },
  { canonicalName: "Pink Lady Apple", aliases: ["pink lady apple", "pink lady apples", "pink lady"], family: "Apple", preservePhrase: true },
  { canonicalName: "Granny Smith Apple", aliases: ["granny smith apple", "granny smith apples", "granny smith"], family: "Apple", preservePhrase: true },
  { canonicalName: "Royal Gala Apple", aliases: ["royal gala apple", "royal gala apples", "royal gala"], family: "Apple", preservePhrase: true },
  { canonicalName: "Sweet Potato", aliases: ["sweet potato", "sweet potatoes"], family: "Potato", preservePhrase: true },
  { canonicalName: "Spring Onion", aliases: ["spring onion", "spring onions", "green onion", "green onions", "scallion", "scallions"], family: "Onion", preservePhrase: true },
  { canonicalName: "Red Onion", aliases: ["red onion", "red onions"], family: "Onion", preservePhrase: true },
  { canonicalName: "Brown Onion", aliases: ["brown onion", "brown onions"], family: "Onion", preservePhrase: true },
  { canonicalName: "Green Beans", aliases: ["green bean", "green beans"], family: "Beans", preservePhrase: true },
  { canonicalName: "Black Beans", aliases: ["black bean", "black beans"], family: "Beans", preservePhrase: true },
  { canonicalName: "Brown Rice", aliases: ["brown rice"], family: "Rice", preservePhrase: true },
  { canonicalName: "White Rice", aliases: ["white rice"], family: "Rice", preservePhrase: true },
  { canonicalName: "Basmati Rice", aliases: ["basmati rice", "basmati"], family: "Rice", preservePhrase: true },
  { canonicalName: "Arborio Rice", aliases: ["arborio rice", "arborio"], family: "Rice", preservePhrase: true },
  { canonicalName: "Jasmine Rice", aliases: ["jasmine rice", "jasmine"], family: "Rice", preservePhrase: true },
  { canonicalName: "White Quinoa", aliases: ["white quinoa"], family: "Quinoa", preservePhrase: true },
  { canonicalName: "Snow Peas", aliases: ["snow pea", "snow peas"], family: "Peas", preservePhrase: true },
  { canonicalName: "Sugar Snap Peas", aliases: ["sugar snap pea", "sugar snap peas", "snap peas"], family: "Peas", preservePhrase: true },
  { canonicalName: "Corn Cob", aliases: ["corn cob", "corn cobs", "corn on the cob"], family: "Corn", preservePhrase: true },
  { canonicalName: "Coriander", aliases: ["coriander", "coriander leaves", "cilantro", "cilantro leaves"], family: "Coriander", preservePhrase: true },
  { canonicalName: "Ground Cinnamon", aliases: ["ground cinnamon"], family: "Cinnamon", preservePhrase: true },
  { canonicalName: "Feta", aliases: ["feta", "feta cheese"], family: "Feta", preservePhrase: true },
  { canonicalName: "Mozzarella", aliases: ["mozzarella", "mozzarella cheese"], family: "Mozzarella", preservePhrase: true },
  { canonicalName: "Pita Bread", aliases: ["pita bread", "pita breads", "pita pocket bread", "pita pocket breads"], family: "Pita Bread", preservePhrase: true },
  { canonicalName: "Spinach", aliases: ["spinach", "spinach leaves"], family: "Spinach", preservePhrase: true },
  { canonicalName: "Peas", aliases: ["pea", "peas"], family: "Peas", preservePhrase: true },
  { canonicalName: "Sage", aliases: ["sage", "sage leaf", "sage leaves"], family: "Sage", preservePhrase: true },
  { canonicalName: "Thyme", aliases: ["thyme", "thyme leaf", "thyme leaves"], family: "Thyme", preservePhrase: true },
  { canonicalName: "Basil Pesto", aliases: ["basil pesto"], family: "Basil Pesto", preservePhrase: true },
  { canonicalName: "Tortillas", aliases: ["tortilla", "tortillas"], family: "Tortillas", preservePhrase: true },
  { canonicalName: "Salmon", aliases: ["salmon"], family: "Salmon", preservePhrase: true },
  { canonicalName: "Tomato", aliases: ["tomato", "tomatoes"], family: "Tomato", preservePhrase: true },
  { canonicalName: "Parsley", aliases: ["parsley", "parsley leaves", "flat leaf parsley", "flat leaf parsley leaves"], family: "Parsley", preservePhrase: true },
  { canonicalName: "Garlic", aliases: ["garlic", "garlic clove", "garlic cloves", "clove garlic"], family: "Garlic", preservePhrase: true },
  { canonicalName: "Lebanese Cucumber", aliases: ["lebanese cucumber", "lebanese cucumbers"], family: "Cucumber", preservePhrase: true },
  { canonicalName: "Leek", aliases: ["leek", "leeks"], family: "Leek", preservePhrase: true },
  { canonicalName: "Lemon", aliases: ["lemon", "lemons"], family: "Lemon", preservePhrase: true },
  { canonicalName: "Lemon Juice", aliases: ["lemon juice"], family: "Lemon", preservePhrase: true },
  { canonicalName: "Lemon Rind", aliases: ["lemon rind", "lemon zest", "lemon zest rind"], family: "Lemon", preservePhrase: true },
  { canonicalName: "Extra Virgin Olive Oil", aliases: ["extra virgin olive oil", "evoo"], family: "Olive Oil", preservePhrase: true },
  { canonicalName: "Olive Oil", aliases: ["olive oil", "cooking olive oil", "spray olive oil"], family: "Olive Oil", preservePhrase: true },
  { canonicalName: "Beef Mince", aliases: ["beef mince", "lean beef mince", "extra lean beef mince", "minced beef"], family: "Beef Mince", preservePhrase: true },
  { canonicalName: "Pine Nuts", aliases: ["pine nut", "pine nuts"], family: "Pine Nuts", preservePhrase: true },
  { canonicalName: "Rolled Oats", aliases: ["rolled oats", "traditional rolled oats", "hot oats"], family: "Oats", preservePhrase: true },
  { canonicalName: "Multigrain Bread", aliases: ["multigrain bread", "crusty multigrain bread"], family: "Multigrain Bread", preservePhrase: true },
  { canonicalName: "Zucchini", aliases: ["zucchini", "zucchinis", "courgette", "courgettes"], family: "Zucchini", preservePhrase: true },
  { canonicalName: "Apple", aliases: ["apple", "apples"], family: "Apple", preservePhrase: true },
  { canonicalName: "Avocado", aliases: ["avocado", "avocados"], family: "Avocado", preservePhrase: true },
  { canonicalName: "Beetroot", aliases: ["beetroot", "beetroots", "beet"], family: "Beetroot", preservePhrase: true },
  { canonicalName: "Carrot", aliases: ["carrot", "carrots", "baby carrot", "baby carrots", "dutch carrot", "dutch carrots", "dutch carrot or baby carrot"], family: "Carrot", preservePhrase: true },
  { canonicalName: "Baking Powder", aliases: ["baking powder"], family: "Baking Powder", preservePhrase: true },
  { canonicalName: "Broccolini", aliases: ["broccolini"], family: "Broccolini", preservePhrase: true },
  { canonicalName: "Soy Sauce", aliases: ["soy sauce"], family: "Soy Sauce", preservePhrase: true },
  { canonicalName: "Spaghetti", aliases: ["spaghetti"], family: "Pasta", preservePhrase: true },
];

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const aliases = concepts
  .flatMap((concept) => concept.aliases.map((alias) => ({ concept, alias: normalise(alias) })))
  .sort((left, right) => right.alias.length - left.alias.length);

export function findGroceryConcept(value: string): GroceryConcept | null {
  const text = normalise(value);
  if (!text) return null;
  const match = aliases.find(({ alias }) => text === alias || text.startsWith(`${alias} `) || text.endsWith(` ${alias}`) || text.includes(` ${alias} `));
  return match?.concept ?? null;
}

export function groceryConcepts() {
  return concepts;
}
