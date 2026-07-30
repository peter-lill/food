import { prisma } from "../src/lib/prisma";
import {
  canonicalGroceryName,
  resolveCanonicalProduct,
} from "../src/lib/products/canonical-grocery.service";

const apply = process.argv.includes("--apply");

type Source = {
  id: string;
  name: string;
  type: "product" | "ingredient" | "shopping";
};

async function main() {
  const [products, ingredients, shoppingItems] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, name: true, canonicalName: true, foodKnowledgeId: true },
      orderBy: { name: "asc" },
    }),
    prisma.ingredient.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.shoppingItem.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const sources: Source[] = [
    ...products.map((item) => ({ id: item.id, name: item.canonicalName ?? item.name, type: "product" as const })),
    ...ingredients.map((item) => ({ ...item, type: "ingredient" as const })),
    ...shoppingItems.map((item) => ({ ...item, type: "shopping" as const })),
  ];

  let resolved = 0;
  let failed = 0;

  for (const source of sources) {
    const canonicalName = canonicalGroceryName(source.name);
    if (!apply) {
      console.log(`${source.type.padEnd(10)} ${source.name} -> ${canonicalName}`);
      resolved += 1;
      continue;
    }

    try {
      const product = await resolveCanonicalProduct(source.name);
      if (source.type === "ingredient") {
        await prisma.ingredient.update({ where: { id: source.id }, data: { productId: product.id } });
      } else if (source.type === "shopping") {
        await prisma.shoppingItem.update({
          where: { id: source.id },
          data: {
            name: product.canonicalName ?? product.name,
            productId: product.id,
          },
        });
      }
      resolved += 1;
    } catch (error) {
      failed += 1;
      console.error(`Unable to resolve ${source.type} ${source.name}`, error);
    }
  }

  console.log(`Canonical grocery backfill ${apply ? "applied" : "previewed"}: ${resolved} resolved, ${failed} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
