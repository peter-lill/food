import { prisma } from "../src/lib/prisma";
import { backgroundJobTypes, enqueueBackgroundJob } from "../src/lib/jobs/background-jobs";
import { genericImageIdentity } from "../src/lib/products/generic-image-policy";
import { readImageAsset, type ImageAssetRecord } from "../src/lib/images/image-asset.service";

const apply = process.argv.includes("--apply");
const missingOnly = process.argv.includes("--missing-only");
const familyFilter = process.argv.find((argument) => argument.startsWith("--family="))?.slice("--family=".length).trim() ?? "";

async function main() {
  const products = await prisma.product.findMany({
    where: {
      lifecycle: { not: "ARCHIVED" },
      brand: null,
      barcode: null,
      ingredientRecords: { some: {} },
    },
    select: { id: true, name: true, canonicalName: true, imageUrl: true },
    orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
  });

  const families = new Map<string, { product: (typeof products)[number]; identity: string }>();
  const skipped: string[] = [];
  for (const product of products) {
    const sourceIdentity = product.canonicalName ?? product.name;
    const identity = genericImageIdentity(sourceIdentity);
    if (!identity) {
      skipped.push(sourceIdentity);
      continue;
    }
    const key = identity.toLocaleLowerCase("en-AU");
    if (!families.has(key)) families.set(key, { product, identity });
  }

  const eligibleFamilies: typeof families extends Map<string, infer Value> ? Value[] : never = [];
  for (const family of families.values()) {
    if (!missingOnly) {
      eligibleFamilies.push(family);
      continue;
    }
    if (!family.product.imageUrl) {
      eligibleFamilies.push(family);
      continue;
    }
    if (!family.product.imageUrl.startsWith("generated://")) continue;
    const assets = await prisma.$queryRaw<ImageAssetRecord[]>`
      SELECT a."id", a."sha256", a."mimeType", a."fileSizeBytes", a."width", a."height",
             a."storagePath", a."originalUrl", a."provider"
      FROM "Product" p
      JOIN "ImageAsset" a ON a."id" = p."primaryImageAssetId"
      WHERE p."id" = ${family.product.id}
      LIMIT 1
    `;
    const readable = assets[0] ? await readImageAsset(assets[0]).then(() => true).catch(() => false) : false;
    if (!readable) eligibleFamilies.push(family);
  }
  const selectedFamilies = familyFilter
    ? eligibleFamilies.filter(({ identity }) => identity.toLocaleLowerCase("en-AU") === familyFilter.toLocaleLowerCase("en-AU"))
    : eligibleFamilies;
  if (familyFilter && !selectedFamilies.length) throw new Error(`No safe generic image family matched ${JSON.stringify(familyFilter)}.`);

  console.log(`${apply ? "Refreshing" : "Would refresh"} ${selectedFamilies.length} ${missingOnly ? "missing " : ""}safe generic family image(s).`);
  console.log(`Skipped ${skipped.length} unresolved recipe identit${skipped.length === 1 ? "y" : "ies"}.`);
  for (const identity of skipped.slice(0, 25)) console.log(`  skipped: ${identity}`);
  if (skipped.length > 25) console.log(`  ...and ${skipped.length - 25} more`);
  for (const { product, identity } of selectedFamilies) {
    console.log(`- ${identity}${product.imageUrl ? " (replacing current image)" : ""}`);
    if (!apply) continue;
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "Product"
        SET "imageUrl" = NULL, "primaryImageAssetId" = NULL,
            "lifecycle" = 'REVIEW_REQUIRED'::"ProductLifecycle", "updatedAt" = NOW()
        WHERE "id" = ${product.id}
      `,
      prisma.$executeRaw`
        UPDATE "ProductImageCandidate"
        SET "selected" = false, "updatedAt" = NOW()
        WHERE "productId" = ${product.id}
      `,
    ]);
    await enqueueBackgroundJob(
      backgroundJobTypes.productImageEnrichment,
      { productId: product.id },
      { deduplicationKey: `generic-family-image:${product.id}`, priority: 120, maxAttempts: 3 },
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
