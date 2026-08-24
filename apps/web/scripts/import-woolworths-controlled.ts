import "dotenv/config";

import { randomUUID } from "node:crypto";
import { Prisma, ProductLifecycle } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { normaliseProductText, slugifyProductName } from "../src/lib/products/product-normalisation";
import {
  categoryForWoolworthsPath,
  canonicalWoolworthsDescription,
  cleanBarcode,
  importEligibility,
  type CachedWoolworthsProduct,
  type ImportDisposition,
} from "./woolworths-controlled-import-matching";

const apply = process.argv.includes("--apply");
const importAll = process.argv.includes("--all");
const verbose = process.argv.includes("--verbose");
const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requestedLimit = Number(argument("--limit") ?? "30");
const offset = Number(argument("--offset") ?? "0");
const category = argument("--category");
const requestedPageSize = Number(argument("--page-size") ?? "500");
const limit = importAll
  ? Number.isInteger(requestedPageSize) && requestedPageSize >= 1 && requestedPageSize <= 1000 ? requestedPageSize : 500
  : Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 1000 ? requestedLimit : 30;

type CachedResponse = { status?: unknown; products?: unknown; nextOffset?: unknown; error?: unknown };
type Plan = {
  product: CachedWoolworthsProduct;
  disposition: ImportDisposition;
  reason: string;
  productId: string | null;
  storeProductId: string | null;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function cachedProduct(value: unknown): CachedWoolworthsProduct | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const stockcode = text(input.stockcode);
  const name = text(input.name);
  const categoryPath = text(input.category_path);
  if (!stockcode || !name || !categoryPath) return null;
  return {
    stockcode, name, category_path: categoryPath,
    barcode: text(input.barcode), price: number(input.price), is_special: input.is_special === true || input.is_special === 1,
    pack_size: text(input.pack_size), image_url: text(input.image_url),
    in_stock: input.in_stock === false || input.in_stock === 0 ? 0 : 1,
    brand: text(input.brand), description: text(input.description), long_description: text(input.long_description),
    allergens: input.allergens, dietary_claims: input.dietary_claims,
    detail_refreshed_at: typeof input.detail_refreshed_at === "number" ? input.detail_refreshed_at : null,
  };
}

async function readCachedProductPage(pageOffset: number) {
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) throw new Error("GROCERY_MCP_BRIDGE_URL is required for the verified Woolworths cache.");
  const url = new URL("/woolworths/catalogue/products", bridgeUrl);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(pageOffset));
  if (category) url.searchParams.set("category", category);
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({})) as CachedResponse;
  if (!response.ok || payload.status !== "success" || !Array.isArray(payload.products)) {
    throw new Error(text(payload.error) ?? `Woolworths cache returned HTTP ${response.status}.`);
  }
  return {
    products: payload.products.flatMap((item) => {
      const product = cachedProduct(item);
      return product ? [product] : [];
    }),
    nextOffset: typeof payload.nextOffset === "number" && Number.isInteger(payload.nextOffset) && payload.nextOffset > pageOffset
      ? payload.nextOffset
      : null,
  };
}

function emptyCounts() {
  return { retain: 0, "link-barcode": 0, "link-name": 0, create: 0, skip: 0 } as Record<ImportDisposition, number>;
}

function duplicatePlannedIdentity(product: CachedWoolworthsProduct, aliases: Set<string>, barcodes: Set<string>) {
  const alias = normaliseProductText(product.name);
  const barcode = cleanBarcode(product.barcode);
  if (aliases.has(alias)) return "another record in this import has the same normalised name";
  if (barcode && barcodes.has(barcode)) return "another record in this import has the same barcode";
  aliases.add(alias);
  if (barcode) barcodes.add(barcode);
  return null;
}

async function plansForPage(products: CachedWoolworthsProduct[], plannedAliases: Set<string>, plannedBarcodes: Set<string>) {
  const stockcodes = [...new Set(products.map((product) => product.stockcode))];
  const barcodes = [...new Set(products.map((product) => cleanBarcode(product.barcode)).filter((value): value is string => Boolean(value)))];
  const aliases = [...new Set(products.map((product) => normaliseProductText(product.name)))];
  const [listings, barcodeProducts, aliasProducts] = await Promise.all([
    prisma.storeProduct.findMany({
      where: { retailer: "Woolworths", externalId: { in: stockcodes } }, select: { id: true, externalId: true, productId: true },
    }),
    barcodes.length ? prisma.product.findMany({ where: { barcode: { in: barcodes } }, select: { id: true, barcode: true } }) : [],
    aliases.length ? prisma.productAlias.findMany({ where: { normalised: { in: aliases } }, select: { normalised: true, productId: true } }) : [],
  ]);
  const listingByStockcode = new Map(listings.flatMap((listing) => listing.externalId ? [[listing.externalId, listing] as const] : []));
  const productByBarcode = new Map(barcodeProducts.flatMap((product) => product.barcode ? [[product.barcode, product.id] as const] : []));
  const productByAlias = new Map(aliasProducts.map((alias) => [alias.normalised, alias.productId]));

  return products.map<Plan>((product) => {
    const eligibility = importEligibility(product);
    if (!eligibility.eligible) return { product, disposition: "skip", reason: eligibility.reason!, productId: null, storeProductId: null };
    const existingListing = listingByStockcode.get(product.stockcode);
    if (existingListing) {
      return { product, disposition: "retain", reason: "authoritative Woolworths listing already exists", productId: existingListing.productId, storeProductId: existingListing.id };
    }
    const barcode = cleanBarcode(product.barcode);
    if (barcode) {
      const productId = productByBarcode.get(barcode);
      if (productId) return { product, disposition: "link-barcode", reason: "exact barcode matches an existing Food product", productId, storeProductId: randomUUID() };
    }
    const normalised = normaliseProductText(product.name);
    const aliasProductId = productByAlias.get(normalised);
    if (aliasProductId) return { product, disposition: "link-name", reason: "exact normalised product name matches an existing Food alias", productId: aliasProductId, storeProductId: randomUUID() };
    if (!barcode) return { product, disposition: "skip", reason: "no barcode; creation is intentionally withheld", productId: null, storeProductId: null };
    const duplicateReason = duplicatePlannedIdentity(product, plannedAliases, plannedBarcodes);
    if (duplicateReason) return { product, disposition: "skip", reason: duplicateReason, productId: null, storeProductId: null };
    return { product, disposition: "create", reason: "verified detail and a unique barcode", productId: randomUUID(), storeProductId: randomUUID() };
  });
}

function listingData(plan: Plan) {
  const { product } = plan;
  return {
    retailerProductName: product.name, brand: product.brand, packSize: product.pack_size,
    productUrl: `https://www.woolworths.com.au/shop/productdetails/${product.stockcode}`,
    imageUrl: product.image_url, active: true, lastSeenAt: new Date(),
  };
}

async function updateExistingListings(tx: Prisma.TransactionClient, plans: Plan[]) {
  if (!plans.length) return;
  const rows = plans.map((plan) => {
    const data = listingData(plan);
    return Prisma.sql`(${plan.storeProductId!}, ${data.retailerProductName}, ${data.brand}, ${data.packSize}, ${data.productUrl}, ${data.imageUrl}, ${data.active}, ${data.lastSeenAt})`;
  });
  await tx.$executeRaw(Prisma.sql`
    UPDATE "StoreProduct" AS target
    SET
      "retailerProductName" = source."retailerProductName",
      "brand" = source."brand",
      "packSize" = source."packSize",
      "productUrl" = source."productUrl",
      "imageUrl" = source."imageUrl",
      "active" = source."active"::boolean,
      "lastSeenAt" = source."lastSeenAt"::timestamp
    FROM (VALUES ${Prisma.join(rows)}) AS source(
      "id", "retailerProductName", "brand", "packSize", "productUrl", "imageUrl", "active", "lastSeenAt"
    )
    WHERE target."id" = source."id"
  `);

  const descriptionRows = plans.map((plan) => Prisma.sql`(${plan.productId!}, ${canonicalWoolworthsDescription(plan.product)})`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "Product" AS target
    SET "description" = source."description"
    FROM (VALUES ${Prisma.join(descriptionRows)}) AS source("id", "description")
    WHERE target."id" = source."id"
      AND (
        target."description" IS NULL
        OR lower(regexp_replace(target."description", '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(COALESCE(target."brand", ''), '[^a-z0-9]+', '', 'g'))
      )
  `);
}

async function attachPage(plans: Plan[]) {
  const applicable = plans.filter((plan) => plan.disposition !== "skip");
  const createdProducts = applicable.filter((plan) => plan.disposition === "create");
  const createdListings = applicable.filter((plan) => plan.disposition !== "retain");
  const existingListings = applicable.filter((plan) => plan.disposition === "retain");
  return prisma.$transaction(async (tx) => {
    if (createdProducts.length) {
      await tx.product.createMany({
        data: createdProducts.map((plan) => {
          const mapped = categoryForWoolworthsPath(plan.product.category_path);
          return {
            id: plan.productId!, name: plan.product.name, canonicalName: plan.product.name,
            slug: `${slugifyProductName(plan.product.name)}-${plan.product.stockcode}`,
            barcode: cleanBarcode(plan.product.barcode), brand: plan.product.brand, category: mapped.category,
            description: canonicalWoolworthsDescription(plan.product),
            imageUrl: plan.product.image_url, packSize: plan.product.pack_size,
            productType: mapped.productType, lifecycle: ProductLifecycle.MATCHED, confidenceScore: 0.99,
          };
        }),
      });
      await tx.productAlias.createMany({
        data: createdProducts.map((plan) => ({ productId: plan.productId!, alias: plan.product.name, normalised: normaliseProductText(plan.product.name), source: "woolworths-controlled-import" })),
      });
    }
    if (createdListings.length) {
      await tx.storeProduct.createMany({
        data: createdListings.map((plan) => ({ id: plan.storeProductId!, productId: plan.productId!, retailer: "Woolworths", externalId: plan.product.stockcode, ...listingData(plan) })),
      });
    }
    await updateExistingListings(tx, existingListings);
    const priceObservations = applicable.filter((plan) => plan.product.price !== null);
    if (priceObservations.length) {
      await tx.priceObservation.createMany({
        data: priceObservations.map((plan) => ({
          productId: plan.productId!, storeProductId: plan.storeProductId!, retailer: "Woolworths", price: plan.product.price!,
          isSpecial: plan.product.is_special, source: "woolworths-controlled-import",
          sourceUrl: `https://www.woolworths.com.au/shop/productdetails/${plan.product.stockcode}`,
        })),
      });
    }
  }, { maxWait: 5_000, timeout: 60_000 });
}

async function main() {
  const counts = emptyCounts();
  const skipReasons = new Map<string, number>();
  const plannedAliases = new Set<string>();
  const plannedBarcodes = new Set<string>();
  let pageOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  let processed = 0;
  let pages = 0;
  while (true) {
    const page = await readCachedProductPage(pageOffset);
    if (!page.products.length && pages === 0) throw new Error("No verified Woolworths cache records were returned for this batch.");
    const plans = await plansForPage(page.products, plannedAliases, plannedBarcodes);
    for (const plan of plans) {
      counts[plan.disposition] += 1;
      if (plan.disposition === "skip") skipReasons.set(plan.reason, (skipReasons.get(plan.reason) ?? 0) + 1);
      if (!importAll || verbose || plan.disposition !== "retain") {
        console.log(`${apply ? "Approved" : "Would"} ${plan.disposition}: ${plan.product.name} | ${plan.product.stockcode} | ${plan.reason}`);
      }
    }
    if (apply && plans.length) await attachPage(plans);
    processed += plans.length;
    pages += 1;
    if (importAll && (processed % 1000 === 0 || page.nextOffset === null)) console.log(`Bulk progress: ${processed} records across ${pages} cache pages.`);
    if (!importAll || page.nextOffset === null) break;
    pageOffset = page.nextOffset;
  }
  if (skipReasons.size) {
    const reasons = Object.fromEntries([...skipReasons].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en-AU")));
    console.log(`Skip reasons: ${JSON.stringify(reasons)}.`);
  }
  if (!apply) return console.log(`${importAll ? "Bulk preview" : "Preview"} complete. ${JSON.stringify(counts)}. No database changes were made.`);
  console.log(`${importAll ? "Woolworths bulk controlled import" : "Woolworths controlled import"} complete. ${JSON.stringify(counts)}.`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
