import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { backgroundJobTypes, enqueueBackgroundJob } from "../src/lib/jobs/background-jobs";

const apply = process.argv.includes("--apply");
const staleDaysArgument = process.argv.find((argument) => argument.startsWith("--stale-days="));
const staleDays = Math.max(1, Number(staleDaysArgument?.split("=")[1] ?? 7));
const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

async function main() {
  const products = await prisma.product.findMany({
    where: {
      lifecycle: { not: "ARCHIVED" },
      priceObservations: { none: { observedAt: { gte: cutoff } } },
    },
    select: { id: true, canonicalName: true, name: true },
    orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
  });

  console.log(`${apply ? "Queueing" : "Would queue"} ${products.length} product price refresh job(s).`);

  if (apply) {
    for (const product of products) {
      await enqueueBackgroundJob(
        backgroundJobTypes.productRetailerEnrichment,
        { productId: product.id, provider: "coles-woolworths" },
        {
          priority: 120,
          deduplicationKey: `product-retailer-enrichment-${product.id}`,
        },
      );
    }
    console.log("Retailer price refresh jobs queued. The background worker will process them safely.");
  }
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
