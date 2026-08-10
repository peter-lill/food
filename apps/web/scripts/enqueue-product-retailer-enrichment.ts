import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { backgroundJobTypes, enqueueBackgroundJob } from "../src/lib/jobs/background-jobs";
import { retailersNeedRefresh } from "../src/lib/retailers/retailer-intelligence.service";

const apply = process.argv.includes("--apply");
const refreshAll = process.argv.includes("--all");
const staleDaysArgument = process.argv.find((argument) => argument.startsWith("--stale-days="));
const staleDays = Math.max(1, Number(staleDaysArgument?.split("=")[1] ?? 7));
const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

async function main() {
  const products = await prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" } },
    select: {
      id: true,
      canonicalName: true,
      name: true,
      storeProducts: {
        where: { lastSeenAt: { gte: cutoff } },
        select: { retailer: true },
      },
    },
    orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
  });
  const productsToRefresh = refreshAll
    ? products
    : products.filter((product) => retailersNeedRefresh(product.storeProducts.map((listing) => listing.retailer)));

  console.log(`${apply ? "Queueing" : "Would queue"} ${productsToRefresh.length} product ${refreshAll ? "authority and image" : "price"} refresh job(s).`);

  if (apply) {
    for (const product of productsToRefresh) {
      await enqueueBackgroundJob(
        backgroundJobTypes.productRetailerEnrichment,
        { productId: product.id, provider: "coles-woolworths", force: refreshAll },
        {
          priority: 120,
          deduplicationKey: `product-retailer-enrichment-${product.id}`,
        },
      );
      if (refreshAll) {
        await enqueueBackgroundJob(
          backgroundJobTypes.productImageEnrichment,
          { productId: product.id },
          {
            priority: 125,
            deduplicationKey: `product-image-authority-refresh-${product.id}`,
          },
        );
      }
    }
    console.log(`${refreshAll ? "Retailer authority and image" : "Retailer price"} refresh jobs queued. The background worker will process them safely.`);
  }
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
