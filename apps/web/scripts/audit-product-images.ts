import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { assessProductImage } from "../src/lib/products/image-quality";

const apply = process.argv.includes("--apply");
const concurrency = 4;

type ProductRow = {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string;
};

async function worker(queue: ProductRow[], results: Array<Record<string, unknown>>) {
  while (queue.length) {
    const product = queue.shift();
    if (!product) return;
    const assessment = await assessProductImage(product.imageUrl);
    const invalid = !assessment.reachable || !assessment.contentType?.startsWith("image/");

    if (apply && invalid) {
      await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: null, lifecycle: "REVIEW_REQUIRED" },
      });
    }

    results.push({
      product: product.name,
      slug: product.slug,
      score: assessment.score,
      dimensions: assessment.width && assessment.height ? `${assessment.width}x${assessment.height}` : "unknown",
      sizeKb: assessment.contentLength === null ? null : Math.round(assessment.contentLength / 1024),
      reachable: assessment.reachable,
      issues: assessment.issues.join("; ") || "none",
      action: apply && invalid ? "cleared" : "kept",
    });
  }
}

async function main() {
  const products = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, name: true, slug: true, imageUrl: true },
    orderBy: { name: "asc" },
  });

  const queue = products.flatMap((product): ProductRow[] => product.imageUrl ? [{ ...product, imageUrl: product.imageUrl }] : []);
  const results: Array<Record<string, unknown>> = [];
  await Promise.all(Array.from({ length: concurrency }, () => worker(queue, results)));

  results.sort((left, right) => Number(left.score) - Number(right.score));
  console.table(results);

  const failing = results.filter((result) => Number(result.score) < 45).length;
  const broken = results.filter((result) => result.reachable === false).length;
  console.log(`\nAudited ${results.length} product images. ${failing} scored below 45; ${broken} were unreachable.`);
  if (!apply) console.log("Report only. Run npm run products:images:audit:apply to clear genuinely invalid images.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
