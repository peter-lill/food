import { prisma } from "../src/lib/prisma";
import { claimGtinIdentity, isValidGtin } from "../src/lib/product-intelligence/gtin-authority";
import { getCatalogueHealth, saveProductQuality } from "../src/lib/product-intelligence/apke-quality";

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 500) : 500;

async function main() {
  const products = await prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
      barcode: true,
      packSize: true,
      confidenceScore: true,
      updatedAt: true,
    },
  });

  console.log(`APKE catalogue pass: ${products.length} products${apply ? " (apply)" : " (preview)"}`);
  let validGtins = 0;
  let invalidGtins = 0;
  let conflicts = 0;
  let scored = 0;

  for (const product of products) {
    if (product.barcode) {
      if (isValidGtin(product.barcode)) {
        validGtins += 1;
        if (apply) {
          const result = await claimGtinIdentity({
            productId: product.id,
            gtin: product.barcode,
            canonicalName: product.canonicalName ?? product.name,
            brand: product.brand,
            packSize: product.packSize,
            source: "catalogue-backfill",
            confidence: Math.max(0.5, Math.min(1, product.confidenceScore || 0.5)),
            verified: false,
          });
          if (result.status === "conflict") conflicts += 1;
        }
      } else {
        invalidGtins += 1;
        console.warn(`Invalid GTIN: ${product.barcode} · ${product.name}`);
      }
    }

    if (apply) {
      await saveProductQuality(product.id);
      scored += 1;
    }
  }

  console.log({ validGtins, invalidGtins, conflicts, scored });
  if (apply) console.log(await getCatalogueHealth());
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
