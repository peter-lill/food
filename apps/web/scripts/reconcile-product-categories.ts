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
    // Preserve every established category. For a genuinely missing legacy
    // value, use the existing conservative department inference and persist
    // an explicit Other when no safe match exists; null must not silently act
    // as a category forever.
    const category = productDepartment(product.category, product.category ? "" : (product.canonicalName ?? product.name));
    const categoryNeedsNormalising = category !== product.category;
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
