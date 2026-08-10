import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { backgroundJobTypes, enqueueBackgroundJob } from "../src/lib/jobs/background-jobs";

const apply = process.argv.includes("--apply");

async function main() {
  const listings = await prisma.storeProduct.findMany({
    where: {
      active: true,
      packSize: null,
      product: { lifecycle: { not: "ARCHIVED" }, productType: { not: "GENERIC_PRODUCE" } },
    },
    select: { productId: true, retailer: true, retailerProductName: true },
    orderBy: [{ retailer: "asc" }, { retailerProductName: "asc" }],
  });
  const productIds = [...new Set(listings.map((listing) => listing.productId))];

  console.log(`${apply ? "Queueing" : "Would queue"} ${productIds.length} product retailer refreshes for ${listings.length} packaged listings without a pack size.`);
  if (!apply) return;

  for (const productId of productIds) {
    await enqueueBackgroundJob(
      backgroundJobTypes.productRetailerEnrichment,
      { productId, provider: "coles-woolworths", force: true, reason: "missing-pack-size" },
      { priority: 110, deduplicationKey: `product-retailer-enrichment-${productId}` },
    );
  }
  console.log("Missing package-size retailer refreshes queued.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
