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

type CachedColesProduct = { external_id?: unknown; category_path?: unknown; category_paths?: unknown };
type CachePage = { status?: unknown; products?: unknown; nextOffset?: unknown; error?: unknown };
type AuditRow = {
  retailer: TaxonomyRetailer; externalId: string | null; product: string; current: string;
  retailerPaths: string[]; retailerDepartment: string; nameDepartment: string; proposed: string;
  disposition: "unchanged" | "candidate" | "conflict" | "insufficient-evidence" | "unreconciled";
};

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }

async function colesEvidenceByExternalId() {
  const result = new Map<string, string[]>();
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) return result;
  let offset = 0;
  while (true) {
    const url = new URL("/coles/catalogue/products", bridgeUrl);
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({})) as CachePage;
    if (!response.ok || payload.status !== "success" || !Array.isArray(payload.products)) {
      throw new Error(text(payload.error) ?? `Coles cache returned HTTP ${response.status}`);
    }
    for (const raw of payload.products as CachedColesProduct[]) {
      const externalId = text(raw.external_id);
      if (!externalId) continue;
      const paths = Array.isArray(raw.category_paths)
        ? raw.category_paths.flatMap((path) => text(path) ? [text(path)!] : [])
        : text(raw.category_path) ? [text(raw.category_path)!] : [];
      result.set(externalId, paths);
    }
    const next = typeof payload.nextOffset === "number" && payload.nextOffset > offset ? payload.nextOffset : null;
    if (next === null) break;
    offset = next;
  }
  return result;
}

async function main() {
  const colesEvidence = !requestedRetailer || requestedRetailer === "Coles"
    ? await colesEvidenceByExternalId()
    : new Map<string, string[]>();

  const listings = await prisma.storeProduct.findMany({
    where: { retailer: requestedRetailer ? requestedRetailer : { in: [...retailers] } },
    select: {
      retailer: true, externalId: true, retailerProductName: true, aisle: true,
      product: { select: { name: true, category: true } },
    },
    orderBy: [{ retailer: "asc" }, { retailerProductName: "asc" }],
    ...(limit ? { take: limit } : {}),
  });

  const rows: AuditRow[] = [];
  const counts = { unchanged: 0, candidate: 0, conflict: 0, "insufficient-evidence": 0, unreconciled: 0 };

  for (const listing of listings) {
    if (!retailers.has(listing.retailer as TaxonomyRetailer)) continue;
    const retailer = listing.retailer as TaxonomyRetailer;
    const cachePaths = retailer === "Coles" && listing.externalId ? colesEvidence.get(listing.externalId) ?? [] : [];
    const paths = cachePaths.length ? cachePaths : listing.aisle ? [listing.aisle] : [];
    const taxonomy = assessRetailerTaxonomy({ retailer, paths });
    const current = listing.product.category?.trim() || "Other";
    const nameDepartment = productDepartment(null, listing.product.name);

    let disposition: AuditRow["disposition"] = "insufficient-evidence";
    let proposed = current;
    if (retailer === "Coles" && !listing.externalId) {
      disposition = "unreconciled";
    } else if (taxonomy.conflict) {
      disposition = "conflict";
    } else if (taxonomy.department) {
      proposed = taxonomy.department;
      disposition = proposed === current ? "unchanged" : "candidate";
    }
    counts[disposition] += 1;

    if (disposition !== "unchanged") rows.push({
      retailer, externalId: listing.externalId, product: listing.product.name, current,
      retailerPaths: taxonomy.paths, retailerDepartment: taxonomy.department ?? "",
      nameDepartment, proposed, disposition,
    });
  }

  console.log(`Retailer taxonomy audit: ${JSON.stringify(counts)} across ${listings.length} listings.`);
  if (requestedRetailer === "Coles" || !requestedRetailer) {
    console.log(`Loaded scanned Coles taxonomy evidence for ${colesEvidence.size} retailer product IDs.`);
  }
  console.log("Preview only. This audit never writes product classifications.");
  for (const row of rows.slice(0, 250)) console.log(JSON.stringify(row));
  if (rows.length > 250) console.log(`... ${rows.length - 250} additional non-unchanged rows omitted from console output.`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
