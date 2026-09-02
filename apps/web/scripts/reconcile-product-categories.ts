import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { productDepartment } from "../src/lib/products/product-category";

const apply = process.argv.includes("--apply");

async function main() {
  const products = await prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" } },
    select: { id: true, name: true, canonicalName: true, category: true },
    orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
  });

  const updates = products.flatMap((product) => {
    // This legacy command must never rewrite an established catalogue record
    // from product-name keywords. It is retained solely to normalise known
    // category aliases already stored in the database (for example, "Fresh
    // produce" -> "Fruit & vegetables").
    const category = productDepartment(product.category, "");
    return category !== "Other" && category !== product.category
      ? [{ id: product.id, category }]
      : [];
  });

  console.log(`${apply ? "Updating" : "Would update"} ${updates.length} product categor${updates.length === 1 ? "y" : "ies"}.`);
  if (!apply) return;

  for (const update of updates) {
    await prisma.product.update({ where: { id: update.id }, data: { category: update.category } });
  }
  console.log("Product categories reconciled.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
