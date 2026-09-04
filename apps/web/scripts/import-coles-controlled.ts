import "dotenv/config";

import { randomUUID } from "node:crypto";
import { ProductLifecycle } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { normaliseProductText, slugifyProductName } from "../src/lib/products/product-normalisation";
import {
  canonicalColesDescription, categoryForColesPath, cleanColesBarcode,
  colesImportEligibility, type CachedColesProduct,
} from "./coles-controlled-import-matching";

const apply = process.argv.includes("--apply");
const importAll = process.argv.includes("--all");
const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requested = Number(argument(importAll ? "--page-size" : "--limit") ?? (importAll ? "500" : "30"));
const pageSize = Number.isInteger(requested) && requested >= 1 && requested <= 1000 ? requested : importAll ? 500 : 30;

type Disposition = "retain" | "link-barcode" | "link-name" | "create" | "skip";
type Plan = { product: CachedColesProduct; disposition: Disposition; reason: string; productId: string | null; storeProductId: string | null };
type CachedResponse = { status?: unknown; products?: unknown; nextOffset?: unknown; error?: unknown };

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function cachedProduct(value: unknown): CachedColesProduct | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const externalId = text(input.external_id); const name = text(input.name); const categoryPath = text(input.category_path);
  if (!externalId || !name || !categoryPath) return null;
  return {
    external_id: externalId, barcode: text(input.barcode), name, brand: text(input.brand),
    description: text(input.description), long_description: text(input.long_description), pack_size: text(input.pack_size),
    price: typeof input.price === "number" && input.price > 0 ? input.price : null,
    was_price: typeof input.was_price === "number" && input.was_price > 0 ? input.was_price : null,
    is_special: input.is_special === true || input.is_special === 1,
    in_stock: input.in_stock !== false && input.in_stock !== 0,
    image_url: text(input.image_url), category_path: categoryPath,
    category_paths: Array.isArray(input.category_paths)
      ? input.category_paths.flatMap((path) => text(path) ? [text(path)!] : [])
      : [categoryPath],
  };
}

async function readPage(offset: number) {
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) throw new Error("GROCERY_MCP_BRIDGE_URL is required for the verified Coles catalogue cache.");
  const url = new URL("/coles/catalogue/products", bridgeUrl);
  url.searchParams.set("limit", String(pageSize)); url.searchParams.set("offset", String(offset));
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({})) as CachedResponse;
  if (!response.ok || payload.status !== "success" || !Array.isArray(payload.products)) {
    throw new Error(text(payload.error) ?? `Coles cache returned HTTP ${response.status}.`);
  }
  return {
    products: payload.products.flatMap((item) => { const product = cachedProduct(item); return product ? [product] : []; }),
    nextOffset: typeof payload.nextOffset === "number" && payload.nextOffset > offset ? payload.nextOffset : null,
  };
}

async function plansForPage(products: CachedColesProduct[], plannedNames: Set<string>, plannedBarcodes: Set<string>): Promise<Plan[]> {
  const ids = products.map((product) => product.external_id);
  const barcodes = products.flatMap((product) => { const barcode = cleanColesBarcode(product.barcode); return barcode ? [barcode] : []; });
  const names = products.map((product) => normaliseProductText(product.name));
  const [listings, barcodeProducts, aliases] = await Promise.all([
    prisma.storeProduct.findMany({ where: { retailer: "Coles", externalId: { in: ids } }, select: { id: true, externalId: true, productId: true } }),
    prisma.product.findMany({ where: { barcode: { in: barcodes } }, select: { id: true, barcode: true } }),
    prisma.productAlias.findMany({ where: { normalised: { in: names } }, select: { normalised: true, productId: true } }),
  ]);
  const listingById = new Map(listings.flatMap((listing) => listing.externalId ? [[listing.externalId, listing] as const] : []));
  const productByBarcode = new Map(barcodeProducts.flatMap((product) => product.barcode ? [[product.barcode, product.id] as const] : []));
  const productByName = new Map(aliases.map((alias) => [alias.normalised, alias.productId]));
  return products.map((product) => {
    const eligibility = colesImportEligibility(product);
    if (!eligibility.eligible) return { product, disposition: "skip", reason: eligibility.reason!, productId: null, storeProductId: null };
    const listing = listingById.get(product.external_id);
    if (listing) return { product, disposition: "retain", reason: "authoritative Coles listing already exists", productId: listing.productId, storeProductId: listing.id };
    const barcode = cleanColesBarcode(product.barcode); const barcodeProduct = barcode ? productByBarcode.get(barcode) : null;
    if (barcodeProduct) return { product, disposition: "link-barcode", reason: "exact barcode matches an existing Food product", productId: barcodeProduct, storeProductId: randomUUID() };
    const nameProduct = productByName.get(normaliseProductText(product.name));
    if (nameProduct) return { product, disposition: "link-name", reason: "exact normalised name matches an existing Food alias", productId: nameProduct, storeProductId: randomUUID() };
    const normalisedName = normaliseProductText(product.name);
    if (plannedNames.has(normalisedName)) return { product, disposition: "skip", reason: "duplicate normalised name in this import", productId: null, storeProductId: null };
    if (barcode && plannedBarcodes.has(barcode)) return { product, disposition: "skip", reason: "duplicate barcode in this import", productId: null, storeProductId: null };
    plannedNames.add(normalisedName); if (barcode) plannedBarcodes.add(barcode);
    return { product, disposition: "create", reason: "unique verified Coles catalogue identity", productId: randomUUID(), storeProductId: randomUUID() };
  });
}

function listingData(plan: Plan) {
  const product = plan.product;
  return {
    retailerProductName: product.name, brand: product.brand, packSize: product.pack_size,
    productUrl: colesProductUrl(product), imageUrl: product.image_url,
    aisle: product.category_path, active: true, lastSeenAt: new Date(),
  };
}

function colesProductUrl(product: CachedColesProduct) {
  return `https://www.coles.com.au/product/${slugifyProductName(product.name)}-${product.external_id}`;
}

async function attachPage(plans: Plan[]) {
  const applicable = plans.filter((plan) => plan.disposition !== "skip");
  const creates = applicable.filter((plan) => plan.disposition === "create");
  const newListings = applicable.filter((plan) => plan.disposition !== "retain");
  await prisma.$transaction(async (tx) => {
    if (creates.length) {
      await tx.product.createMany({ data: creates.map((plan) => {
        const product = plan.product; const mapped = categoryForColesPath(product.category_path);
        return {
          id: plan.productId!, name: product.name, canonicalName: product.name,
          slug: `${slugifyProductName(product.name)}-coles-${product.external_id}`,
          barcode: cleanColesBarcode(product.barcode), brand: product.brand, category: mapped.category,
          description: canonicalColesDescription(product), imageUrl: product.image_url, packSize: product.pack_size,
          productType: mapped.productType, lifecycle: ProductLifecycle.REVIEW_REQUIRED, confidenceScore: 0.85,
        };
      }) });
      await tx.productAlias.createMany({ data: creates.map((plan) => ({
        productId: plan.productId!, alias: plan.product.name,
        normalised: normaliseProductText(plan.product.name), source: "coles-controlled-import",
      })) });
    }
    if (newListings.length) await tx.storeProduct.createMany({ data: newListings.map((plan) => ({
      id: plan.storeProductId!, productId: plan.productId!, retailer: "Coles",
      externalId: plan.product.external_id, ...listingData(plan),
    })) });
    for (const plan of applicable.filter((candidate) => candidate.disposition === "retain")) {
      await tx.storeProduct.update({ where: { id: plan.storeProductId! }, data: listingData(plan) });
    }
    for (const plan of applicable) {
      const mapped = categoryForColesPath(plan.product.category_path);
      if (mapped.category !== "Other") await tx.product.update({ where: { id: plan.productId! }, data: { category: mapped.category, productType: mapped.productType } });
    }
    const priced = applicable.filter((plan) => plan.product.price !== null);
    if (priced.length) await tx.priceObservation.createMany({ data: priced.map((plan) => ({
      productId: plan.productId!, storeProductId: plan.storeProductId!, retailer: "Coles", price: plan.product.price!,
      isSpecial: Boolean(plan.product.is_special), source: "coles-controlled-import",
      sourceUrl: colesProductUrl(plan.product),
    })) });
  }, { maxWait: 5_000, timeout: 60_000 });
}

async function main() {
  const counts: Record<Disposition, number> = { retain: 0, "link-barcode": 0, "link-name": 0, create: 0, skip: 0 };
  const reasons = new Map<string, number>(); const plannedNames = new Set<string>(); const plannedBarcodes = new Set<string>();
  let offset = 0; let processed = 0; let pages = 0;
  while (true) {
    const page = await readPage(offset);
    if (!page.products.length && pages === 0) throw new Error("No verified Coles cache records were returned.");
    const plans = await plansForPage(page.products, plannedNames, plannedBarcodes);
    for (const plan of plans) { counts[plan.disposition] += 1; if (plan.disposition === "skip") reasons.set(plan.reason, (reasons.get(plan.reason) ?? 0) + 1); }
    if (apply) await attachPage(plans);
    processed += plans.length; pages += 1;
    if (importAll && (processed % 1000 === 0 || page.nextOffset === null)) console.log(`Bulk progress: ${processed} records across ${pages} cache pages.`);
    if (!importAll || page.nextOffset === null) break;
    offset = page.nextOffset;
  }
  if (reasons.size) console.log(`Skip reasons: ${JSON.stringify(Object.fromEntries(reasons))}.`);
  console.log(`${apply ? "Coles controlled import" : "Coles import preview"} complete. ${JSON.stringify(counts)}.${apply ? "" : " No database changes were made."}`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
