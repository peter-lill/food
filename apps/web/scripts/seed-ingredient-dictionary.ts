import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  ingredientDictionaryStats,
  upsertIngredientDictionaryEntry,
} from "../src/lib/product-intelligence/ingredient-dictionary";
import { australianIngredientDictionarySeed } from "../src/lib/product-intelligence/ingredient-dictionary.seed";

async function main() {
  console.log(`Seeding ${australianIngredientDictionarySeed.length} APKE ingredient dictionary entries...`);

  let completed = 0;
  for (const entry of australianIngredientDictionarySeed) {
    await upsertIngredientDictionaryEntry(entry, "APKE_AUSTRALIAN_SEED_V1");
    completed += 1;
    if (completed % 10 === 0 || completed === australianIngredientDictionarySeed.length) {
      console.log(`  ${completed}/${australianIngredientDictionarySeed.length}`);
    }
  }

  const stats = await ingredientDictionaryStats();
  console.log("Ingredient Dictionary ready:");
  console.log(`  Canonical ingredients: ${stats.ingredients}`);
  console.log(`  Aliases: ${stats.aliases}`);
  console.log(`  Additives: ${stats.additives}`);
  console.log(`  Allergen mappings: ${stats.allergenMappings}`);
}

main()
  .catch((error) => {
    console.error("Ingredient Dictionary seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
