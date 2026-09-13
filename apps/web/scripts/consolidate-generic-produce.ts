import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { CanonicalProductService } from "../src/lib/product-intelligence/CanonicalProductService";

const apply = process.argv.includes("--apply");

void CanonicalProductService.consolidateGenericProduce({ apply })
  .then((result) => {
    const duplicateGroups = result.groups.filter((group) => group.merged > 0);
    console.log(`${apply ? "Generic produce consolidation" : "Generic produce consolidation preview"}: ${result.merged} duplicate products across ${duplicateGroups.length} sellable variants.`);
    for (const group of duplicateGroups) console.log(`${group.canonicalName}: ${group.merged} duplicate(s)`);
    if (!apply) console.log("No database changes were made. Re-run with --apply after reviewing the preview.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
