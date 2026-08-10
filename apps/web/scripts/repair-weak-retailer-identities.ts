import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { productDepartment } from "../src/lib/products/product-category";
import { normaliseProductText, slugifyProductName } from "../src/lib/products/product-normalisation";

const apply = process.argv.includes("--apply");

function words(value: string) {
  return normaliseProductText(value).split(" ").filter(Boolean);
}

function replacementName(currentName: string, listingNames: string[]) {
  const current = normaliseProductText(currentName);
  if (words(currentName).length !== 1 || !current) return null;
  const candidates = [...new Set(listingNames.map((name) => name.trim()).filter(Boolean))]
    .filter((name) => words(name).length >= 2)
    .filter((name) => new RegExp(`\\b${current}\\b`, "i").test(normaliseProductText(name)))
    .sort((left, right) => right.length - left.length);
  return candidates[0] ?? null;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" }, brand: null, barcode: null },
    select: {
      id: true, name: true, canonicalName: true, category: true,
      storeProducts: { where: { active: true }, select: { retailerProductName: true } },
    },
    orderBy: { name: "asc" },
  });
  const repairs = products.flatMap((product) => {
    const name = replacementName(product.canonicalName ?? product.name, product.storeProducts.map((listing) => listing.retailerProductName));
    return name ? [{ product, name }] : [];
  });

  console.log(`${apply ? "Repairing" : "Would repair"} ${repairs.length} weak product identit${repairs.length === 1 ? "y" : "ies"} from linked retailer listings.`);
  for (const { product, name } of repairs) console.log(`- ${product.name} -> ${name}`);
  if (!apply) return;

  for (const { product, name } of repairs) {
    const oldName = product.name;
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: {
          name,
          canonicalName: name,
          slug: slugifyProductName(name),
          category: productDepartment(product.category, name),
        },
      });
      await tx.productAlias.upsert({
        where: { normalised: normaliseProductText(oldName) },
        update: { productId: product.id, alias: oldName, source: "linked-retailer-repair" },
        create: { productId: product.id, alias: oldName, normalised: normaliseProductText(oldName), source: "linked-retailer-repair" },
      });
    });
  }
  console.log("Weak retailer identities repaired.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
