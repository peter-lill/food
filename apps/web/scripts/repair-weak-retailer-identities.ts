import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { productDepartment } from "../src/lib/products/product-category";
import { normaliseProductText, slugifyProductName } from "../src/lib/products/product-normalisation";
import { identifyGrocery } from "../src/lib/grocery-intelligence/identity";

const apply = process.argv.includes("--apply");

function words(value: string) {
  return normaliseProductText(value).split(" ").filter(Boolean);
}

function replacementName(currentName: string, listingNames: string[]) {
  const current = normaliseProductText(currentName);
  if (words(currentName).length !== 1 || !current) return null;
  const currentConcept = identifyGrocery(currentName);
  if (currentConcept) return currentConcept.canonicalName;

  // A generic word such as "Mix" must never inherit whichever linked retailer
  // title happens to be longest. Only repair when every recognised listing
  // independently resolves to the same grocery concept.
  const identities = listingNames
    .map((name) => identifyGrocery(name)?.canonicalName ?? null)
    .filter((name): name is string => Boolean(name));
  if (!identities.length || identities.length !== listingNames.length) return null;
  return new Set(identities).size === 1 ? identities[0] : null;
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
