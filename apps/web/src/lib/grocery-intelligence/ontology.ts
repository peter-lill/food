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
  { canonicalName: "Jasmine Rice", aliases: ["jasmine rice", "jasmine"], family: "Rice", preservePhrase: true },
  { canonicalName: "White Quinoa", aliases: ["white quinoa"], family: "Quinoa", preservePhrase: true },
  { canonicalName: "Snow Peas", aliases: ["snow pea", "snow peas"], family: "Peas", preservePhrase: true },
  { canonicalName: "Sugar Snap Peas", aliases: ["sugar snap pea", "sugar snap peas", "snap peas"], family: "Peas", preservePhrase: true },
  { canonicalName: "Corn Cob", aliases: ["corn cob", "corn cobs", "corn on the cob"], family: "Corn", preservePhrase: true },
  { canonicalName: "Extra Virgin Olive Oil", aliases: ["extra virgin olive oil", "evoo"], family: "Olive Oil", preservePhrase: true },
  { canonicalName: "Olive Oil", aliases: ["olive oil", "cooking olive oil", "spray olive oil"], family: "Olive Oil", preservePhrase: true },
  { canonicalName: "Beef Mince", aliases: ["beef mince", "lean beef mince", "extra lean beef mince", "minced beef"], family: "Beef Mince", preservePhrase: true },
  { canonicalName: "Pine Nuts", aliases: ["pine nut", "pine nuts"], family: "Pine Nuts", preservePhrase: true },
  { canonicalName: "Rolled Oats", aliases: ["rolled oats", "traditional rolled oats", "hot oats"], family: "Oats", preservePhrase: true },
  { canonicalName: "Zucchini", aliases: ["zucchini", "zucchinis", "courgette", "courgettes"], family: "Zucchini", preservePhrase: true },
  { canonicalName: "Apple", aliases: ["apple", "apples"], family: "Apple", preservePhrase: true },
  { canonicalName: "Avocado", aliases: ["avocado", "avocados"], family: "Avocado", preservePhrase: true },
  { canonicalName: "Beetroot", aliases: ["beetroot", "beetroots", "beet"], family: "Beetroot", preservePhrase: true },
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
