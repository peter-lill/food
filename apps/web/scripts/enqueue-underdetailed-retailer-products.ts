import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { backgroundJobTypes, enqueueBackgroundJob } from "../src/lib/jobs/background-jobs";
import { normaliseProductText } from "../src/lib/products/product-normalisation";

const apply = process.argv.includes("--apply");

function hasMoreSpecificListing(productName: string, listingNames: string[]) {
  const product = normaliseProductText(productName);
  const productTokens = product.split(" ").filter(Boolean);
  return listingNames.some((listingName) => {
    const listing = normaliseProductText(listingName);
    const listingTokens = listing.split(" ").filter(Boolean);
    return listingTokens.length > productTokens.length && productTokens.every((token) => listingTokens.includes(token));
  });
}

async function main() {
  const products = await prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" }, barcode: { not: null } },
    select: {
      id: true, name: true, canonicalName: true,
      storeProducts: { where: { active: true }, select: { retailerProductName: true } },
    },
    orderBy: { name: "asc" },
  });
  const productIds = products
    .filter((product) => hasMoreSpecificListing(product.canonicalName ?? product.name, product.storeProducts.map((listing) => listing.retailerProductName)))
    .map((product) => product.id);

  console.log(`${apply ? "Queueing" : "Would queue"} ${productIds.length} barcode products with an under-detailed stored identity.`);
  if (!apply) return;
  for (const productId of productIds) {
    await enqueueBackgroundJob(
      backgroundJobTypes.productRetailerEnrichment,
      { productId, provider: "coles-woolworths", force: true, reason: "under-detailed-retailer-identity" },
      { priority: 105, deduplicationKey: `product-retailer-enrichment-${productId}` },
    );
  }
  console.log("Under-detailed retailer product refreshes queued.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
