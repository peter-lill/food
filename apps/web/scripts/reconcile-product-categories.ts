import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { productDepartment } from "../src/lib/products/product-category";
import { defaultProductTypeForDepartment, isProductTypeCompatibleWithDepartment } from "./product-category-audit-policy";

const apply = process.argv.includes("--apply");

async function main() {
  const products = await prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" } },
    select: { id: true, name: true, canonicalName: true, category: true, productType: true },
    orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
  });

  const updates = products.flatMap((product) => {
    // This legacy command must never rewrite an established catalogue record
    // from product-name keywords. It is retained solely to normalise known
    // category aliases already stored in the database (for example, "Fresh
    // produce" -> "Fruit & vegetables").
    const category = productDepartment(product.category, "");
    const categoryNeedsNormalising = category !== "Other" && category !== product.category;
    const productTypeNeedsRepair = !isProductTypeCompatibleWithDepartment(category, product.productType);
    return categoryNeedsNormalising || productTypeNeedsRepair
      ? [{
          id: product.id,
          category: categoryNeedsNormalising ? category : product.category,
          productType: productTypeNeedsRepair ? defaultProductTypeForDepartment(category) : product.productType,
        }]
      : [];
  });

  console.log(`${apply ? "Updating" : "Would update"} ${updates.length} product categor${updates.length === 1 ? "y" : "ies"}.`);
  if (!apply) return;

  for (const update of updates) {
    await prisma.product.update({ where: { id: update.id }, data: { category: update.category, productType: update.productType } });
  }
  console.log("Product categories reconciled.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
