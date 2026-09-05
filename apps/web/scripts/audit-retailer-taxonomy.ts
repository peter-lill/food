import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { assessRetailerTaxonomy, type TaxonomyRetailer } from "../src/lib/products/retailer-taxonomy";
import { productDepartment } from "../src/lib/products/product-category";

const retailers = new Set<TaxonomyRetailer>(["Coles", "Woolworths", "ALDI", "Drakes"]);
const requestedRetailer = process.argv.find((value) => value.startsWith("--retailer="))?.split("=", 2)[1]?.trim() ?? "";
const limitText = process.argv.find((value) => value.startsWith("--limit="))?.split("=", 2)[1] ?? "0";
const limit = Math.max(0, Number(limitText) || 0);

if (requestedRetailer && !retailers.has(requestedRetailer as TaxonomyRetailer)) {
  throw new Error(`Unsupported retailer: ${requestedRetailer}`);
}

type AuditRow = {
  retailer: TaxonomyRetailer;
  externalId: string | null;
  product: string;
  current: string;
  retailerPath: string;
  retailerDepartment: string;
  nameDepartment: string;
  proposed: string;
  disposition: "unchanged" | "candidate" | "conflict" | "insufficient-evidence";
};

async function main() {
  const listings = await prisma.storeProduct.findMany({
    where: {
      retailer: requestedRetailer ? requestedRetailer : { in: [...retailers] },
      ...(limit ? {} : {}),
    },
    select: {
      retailer: true,
      externalId: true,
      retailerProductName: true,
      aisle: true,
      product: { select: { name: true, category: true } },
    },
    orderBy: [{ retailer: "asc" }, { retailerProductName: "asc" }],
    ...(limit ? { take: limit } : {}),
  });

  const rows: AuditRow[] = [];
  const counts = { unchanged: 0, candidate: 0, conflict: 0, "insufficient-evidence": 0 };

  for (const listing of listings) {
    if (!retailers.has(listing.retailer as TaxonomyRetailer)) continue;
    const retailer = listing.retailer as TaxonomyRetailer;
    const taxonomy = assessRetailerTaxonomy({ retailer, paths: listing.aisle ? [listing.aisle] : [] });
    const current = listing.product.category?.trim() || "Other";
    const nameDepartment = productDepartment(null, listing.product.name);

    let disposition: AuditRow["disposition"] = "insufficient-evidence";
    let proposed = current;
    if (taxonomy.conflict) {
      disposition = "conflict";
    } else if (taxonomy.department) {
      proposed = taxonomy.department;
      disposition = proposed === current ? "unchanged" : "candidate";
    }
    counts[disposition] += 1;

    if (disposition !== "unchanged") {
      rows.push({
        retailer,
        externalId: listing.externalId,
        product: listing.product.name,
        current,
        retailerPath: taxonomy.deepestPath ?? "",
        retailerDepartment: taxonomy.department ?? "",
        nameDepartment,
        proposed,
        disposition,
      });
    }
  }

  console.log(`Retailer taxonomy audit: ${JSON.stringify(counts)} across ${listings.length} listings.`);
  console.log("Preview only. This audit never writes product classifications.");
  for (const row of rows.slice(0, 250)) console.log(JSON.stringify(row));
  if (rows.length > 250) console.log(`... ${rows.length - 250} additional non-unchanged rows omitted from console output.`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
