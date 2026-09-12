import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { productDepartment, type SupermarketDepartment } from "../src/lib/products/product-category";
import { canRepairImportedCategory, categoryResolutionForImport, comparableProductCategoryKey, supportedRetailerCategoryPath } from "./catalogue-import-category-evidence";
import { canonicalAldiExternalId } from "./imported-catalogue-path-recovery";

const apply = process.argv.includes("--apply");
const aldiOnly = process.argv.includes("--aldi-only");
const drakesOnly = process.argv.includes("--drakes-only");
const drakesStoreId = process.env.DRAKES_STORE_ID?.trim() || "087";
const importedRetailers = ["ALDI", "Drakes"];
const pageSize = 500;

type CachedResponse = {
  status?: unknown;
  products?: unknown;
  nextOffset?: unknown;
  error?: unknown;
};

type CachedProduct = {
  externalId: string;
  categoryPaths: string[];
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function canonicalDrakesExternalId(value: string | null | undefined) {
  const externalId = text(value);
  if (!externalId) return null;

  const prefix = `${drakesStoreId}:`;
  return externalId.startsWith(prefix)
    ? externalId.slice(prefix.length)
    : externalId;
}

async function aldiCachedProducts() {
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) {
    throw new Error("GROCERY_MCP_BRIDGE_URL is required to reconcile ALDI category evidence.");
  }

  const products: CachedProduct[] = [];
  let offset = 0;

  while (true) {
    const url = new URL("/aldi/catalogue/products", bridgeUrl);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({})) as CachedResponse;

    if (!response.ok || payload.status !== "success" || !Array.isArray(payload.products)) {
      throw new Error(text(payload.error) ?? `ALDI catalogue returned HTTP ${response.status}.`);
    }

    for (const value of payload.products) {
      if (!value || typeof value !== "object") continue;

      const input = value as Record<string, unknown>;
      const externalId = text(input.external_id);
      const categoryPath = text(input.category_path);
      const categoryPaths = Array.isArray(input.category_paths)
        ? input.category_paths.flatMap((candidate) => {
            const path = text(candidate);
            return path ? [path] : [];
          })
        : [];

      if (!externalId || !categoryPath) continue;

      products.push({
        externalId,
        categoryPaths: [...new Set([...categoryPaths, categoryPath])],
      });
    }

    if (typeof payload.nextOffset !== "number" || payload.nextOffset <= offset) break;
    offset = payload.nextOffset;
  }

  return products;
}


async function drakesCachedProducts() {
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) {
    throw new Error("GROCERY_MCP_BRIDGE_URL is required to reconcile Drakes category evidence.");
  }

  const products: CachedProduct[] = [];
  let offset = 0;

  while (true) {
    const url = new URL("/drakes/catalogue/products", bridgeUrl);
    url.searchParams.set("storeId", drakesStoreId);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({})) as CachedResponse;

    if (!response.ok || payload.status !== "success" || !Array.isArray(payload.products)) {
      throw new Error(text(payload.error) ?? `Drakes catalogue returned HTTP ${response.status}.`);
    }

    for (const value of payload.products) {
      if (!value || typeof value !== "object") continue;

      const input = value as Record<string, unknown>;
      const externalId = text(input.external_id);
      const categoryPath = text(input.category_path);
      const categoryPaths = Array.isArray(input.category_paths)
        ? input.category_paths.flatMap((candidate) => {
            const path = text(candidate);
            return path ? [path] : [];
          })
        : [];

      if (!externalId || !categoryPath) continue;

      products.push({
        externalId,
        categoryPaths: [...new Set([...categoryPaths, categoryPath])],
      });
    }

    if (typeof payload.nextOffset !== "number" || payload.nextOffset <= offset) break;
    offset = payload.nextOffset;
  }

  return products;
}

type Update = {
  id: string;
  name: string;
  from: SupermarketDepartment;
  to: SupermarketDepartment;
  productType: Awaited<ReturnType<typeof categoryResolutionForImport>>["productType"];
  source: Awaited<ReturnType<typeof categoryResolutionForImport>>["source"];
  retailers: string[];
  aldiEvidence: "fresh-cache" | "fallback-aisle" | "not-aldi";
  drakesEvidence: "fresh-cache" | "fallback-aisle" | "not-drakes";
};

async function main() {
  // A product is eligible only when all of its live catalogue listings came
  // from the two imports that formerly had retailer-specific keyword rules.
  // Products with Coles, Woolworths, or another retailer are left untouched.
  const [importedProducts, evidenceAliases, aldiCache, drakesCache] = await Promise.all([
    prisma.product.findMany({
      where: {
        lifecycle: { not: "ARCHIVED" },
        storeProducts: {
          some: { active: true, retailer: { in: importedRetailers } },
          none: { active: true, retailer: { notIn: importedRetailers } },
        },
      },
      select: {
        id: true,
        name: true,
        canonicalName: true,
        category: true,
        storeProducts: {
          where: { active: true },
          select: { retailer: true, externalId: true, aisle: true },
        },
      },
      orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
    }),
    prisma.productAlias.findMany({
      where: {
        product: {
          lifecycle: { not: "ARCHIVED" },
          storeProducts: { some: { retailer: { notIn: importedRetailers } } },
        },
      },
      select: { alias: true, product: { select: { category: true } } },
    }),
    aldiCachedProducts(),
    drakesCachedProducts(),
  ]);

  const aldiById = new Map(
    aldiCache.flatMap((product) => {
      const id = canonicalAldiExternalId(product.externalId);
      return id ? [[id, product] as const] : [];
    }),
  );

  const drakesById = new Map(
    drakesCache.map((product) => [product.externalId, product] as const),
  );

  const comparableCategories = new Map<string, Set<SupermarketDepartment>>();
  for (const alias of evidenceAliases) {
    const key = comparableProductCategoryKey(alias.alias);
    const category = productDepartment(alias.product.category, "");
    if (!key || category === "Other") continue;
    const categories = comparableCategories.get(key) ?? new Set<SupermarketDepartment>();
    categories.add(category);
    comparableCategories.set(key, categories);
  }

  const updates: Update[] = [];
  let skippedNameOnly = 0;
  for (const product of importedProducts) {
    const name = product.canonicalName ?? product.name;
    const from = productDepartment(product.category, "");

    const retailerPaths = product.storeProducts.flatMap((listing) => {
      if (listing.retailer === "ALDI") {
        const externalId = canonicalAldiExternalId(listing.externalId);
        const cached = externalId ? aldiById.get(externalId) : null;

        return cached?.categoryPaths.length
          ? cached.categoryPaths
          : listing.aisle
            ? [listing.aisle]
            : [];
      }

      if (listing.retailer === "Drakes") {
        const externalId = canonicalDrakesExternalId(listing.externalId);
        const cached = externalId ? drakesById.get(externalId) : null;

        return cached?.categoryPaths.length
          ? cached.categoryPaths
          : listing.aisle
            ? [listing.aisle]
            : [];
      }

      return listing.aisle ? [listing.aisle] : [];
    });

    const retailerPath = supportedRetailerCategoryPath(name, retailerPaths, from);
    const resolved = categoryResolutionForImport(name, comparableCategories, retailerPath);
    // Historical product titles often contain ingredients, flavours, and use
    // cases. A name-only conclusion is never enough to rewrite an established
    // category ("dog food with beef", "lemon cleaner", and "apple jelly" are
    // representative false positives). A first-level retailer department is
    // authoritative, including an explicit general-merchandise/Other path, as
    // is a unanimous comparable-product family.
    if (resolved.source === "unclassified") {
      skippedNameOnly += 1;
      continue;
    }
    if (!canRepairImportedCategory(resolved, from)) continue;

    const retailers = [...new Set(product.storeProducts.map((listing) => listing.retailer))];
    if (aldiOnly && !retailers.includes("ALDI")) continue;
    if (drakesOnly && !retailers.includes("Drakes")) continue;
    const aldiListings = product.storeProducts.filter((listing) => listing.retailer === "ALDI");
    const aldiEvidence = !aldiListings.length
      ? "not-aldi"
      : aldiListings.every((listing) => {
          const externalId = canonicalAldiExternalId(listing.externalId);
          return Boolean(externalId && aldiById.has(externalId));
        })
        ? "fresh-cache"
        : "fallback-aisle";

    const drakesListings = product.storeProducts.filter((listing) => listing.retailer === "Drakes");
    const drakesEvidence = !drakesListings.length
      ? "not-drakes"
      : drakesListings.every((listing) =>
          Boolean(
            canonicalDrakesExternalId(listing.externalId)
            && drakesById.has(canonicalDrakesExternalId(listing.externalId)!),
          ),
        )
        ? "fresh-cache"
        : "fallback-aisle";

    updates.push({
      id: product.id,
      name,
      from,
      to: resolved.category,
      productType: resolved.productType,
      source: resolved.source,
      retailers,
      aldiEvidence,
      drakesEvidence,
    });
  }

  const sourceCounts = Object.fromEntries(
    [...new Set(updates.map((update) => update.source))].map((source) => [source, updates.filter((update) => update.source === source).length]),
  );
  const scopeLabel = aldiOnly
    ? "ALDI-backed"
    : drakesOnly
      ? "Drakes-backed"
      : "ALDI/Drakes-only";
  console.log(`${apply ? "Updating" : "Would update"} ${updates.length} ${scopeLabel} product categor${updates.length === 1 ? "y" : "ies"}.`);
  console.log(`Category evidence: ${JSON.stringify(sourceCounts)}.`);

  const retailerCounts = Object.fromEntries(
    [...new Set(updates.flatMap((update) => update.retailers))].map((retailer) => [
      retailer,
      updates.filter((update) => update.retailers.includes(retailer)).length,
    ]),
  );
  const aldiEvidenceCounts = Object.fromEntries(
    [...new Set(updates.map((update) => update.aldiEvidence))].map((evidence) => [
      evidence,
      updates.filter((update) => update.aldiEvidence === evidence).length,
    ]),
  );

  const drakesEvidenceCounts = Object.fromEntries(
    [...new Set(updates.map((update) => update.drakesEvidence))].map((evidence) => [
      evidence,
      updates.filter((update) => update.drakesEvidence === evidence).length,
    ]),
  );

  console.log(`Proposed updates by retailer: ${JSON.stringify(retailerCounts)}.`);
  console.log(`ALDI evidence coverage: ${JSON.stringify(aldiEvidenceCounts)}.`);
  console.log(`Drakes evidence coverage: ${JSON.stringify(drakesEvidenceCounts)}.`);

  const drakesOnlyUpdates = updates.filter(
    (update) => update.retailers.includes("Drakes") && !update.retailers.includes("ALDI"),
  );
  const aldiAndDrakes = updates.filter(
    (update) => update.retailers.includes("ALDI") && update.retailers.includes("Drakes"),
  );

  console.log(`Drakes-only proposed updates: ${drakesOnlyUpdates.length}.`);
  for (const update of drakesOnlyUpdates) {
    console.log(`  ${update.from} -> ${update.to}: ${update.name} [${update.drakesEvidence}]`);
  }

  console.log(`ALDI + Drakes proposed updates: ${aldiAndDrakes.length}.`);
  for (const update of aldiAndDrakes) {
    console.log(`  ${update.from} -> ${update.to}: ${update.name} [ALDI ${update.aldiEvidence}; Drakes ${update.drakesEvidence}]`);
  }

  console.log(`Skipped ${skippedNameOnly} name-only candidates; they require stronger category evidence.`);
  for (const update of updates.slice(0, 100)) {
    console.log(`${update.from} -> ${update.to} [${update.source}] ${update.name}`);
  }
  if (updates.length > 100) console.log(`…and ${updates.length - 100} more.`);
  if (!apply) {
    console.log("No database changes were made. Review the preview, then rerun with --apply.");
    return;
  }

  for (const update of updates) {
    await prisma.product.update({ where: { id: update.id }, data: { category: update.to, productType: update.productType } });
  }
  console.log("Imported product categories reconciled.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
