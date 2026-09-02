import "dotenv/config";

import { randomUUID } from "node:crypto";
import { ProductLifecycle } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { productDepartment, type SupermarketDepartment } from "../src/lib/products/product-category";
import { normaliseProductText, slugifyProductName } from "../src/lib/products/product-normalisation";
import { categoryResolutionForImport, comparableProductCategoryKey, type ImportedCategoryResolution } from "./catalogue-import-category-evidence";
import { hasSuspiciousLabelTail, type ImportDisposition } from "./woolworths-controlled-import-matching";

const apply = process.argv.includes("--apply");
const importAll = process.argv.includes("--all");
const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requestedPageSize = Number(argument("--page-size") ?? "500");
const requestedLimit = Number(argument("--limit") ?? "30");
const pageSize = Number.isInteger(importAll ? requestedPageSize : requestedLimit) && (importAll ? requestedPageSize : requestedLimit) >= 1 && (importAll ? requestedPageSize : requestedLimit) <= 1000
  ? (importAll ? requestedPageSize : requestedLimit) : (importAll ? 500 : 30);

type CachedResponse = { status?: unknown; products?: unknown; nextOffset?: unknown; error?: unknown };
type AldiProduct = { externalId: string; name: string; brand: string | null; packSize: string | null; unitPrice: string | null; price: number; imageUrl: string | null; productUrl: string; categoryPath: string };
type Plan = { product: AldiProduct; disposition: ImportDisposition; reason: string; productId: string | null; storeProductId: string | null; category: ImportedCategoryResolution | null };

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function price(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null; }
function cachedProduct(value: unknown): AldiProduct | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const externalId = text(input.external_id); const name = text(input.name); const productUrl = text(input.product_url); const productPrice = price(input.price);
  if (!externalId || !name || !productUrl || productPrice === null) return null;
  return { externalId, name, productUrl, price: productPrice, brand: text(input.brand), packSize: text(input.pack_size), unitPrice: text(input.unit_price), imageUrl: text(input.image_url), categoryPath: text(input.category_path) ?? "/products" };
}

async function readPage(offset: number) {
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) throw new Error("GROCERY_MCP_BRIDGE_URL is required for the ALDI catalogue cache.");
  const url = new URL("/aldi/catalogue/products", bridgeUrl); url.searchParams.set("limit", String(pageSize)); url.searchParams.set("offset", String(offset));
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({})) as CachedResponse;
  if (!response.ok || payload.status !== "success" || !Array.isArray(payload.products)) throw new Error(text(payload.error) ?? `ALDI cache returned HTTP ${response.status}.`);
  return { products: payload.products.flatMap((item) => { const product = cachedProduct(item); return product ? [product] : []; }), nextOffset: typeof payload.nextOffset === "number" && payload.nextOffset > offset ? payload.nextOffset : null };
}

function eligibility(product: AldiProduct) {
  if (!/^\d+$/.test(product.externalId)) return "missing stable ALDI catalogue identifier";
  if (normaliseProductText(product.name).length < 3) return "missing usable product name";
  if (hasSuspiciousLabelTail(product.name)) return "product name ends with a suspicious truncated label fragment";
  return null;
}

async function plansForPage(products: AldiProduct[], aliasesSeen: Set<string>) {
  const externalIds = products.map((product) => product.externalId); const aliases = products.map((product) => normaliseProductText(product.name));
  const comparableKeys = products.flatMap((product) => { const key = comparableProductCategoryKey(product.name); return key ? [key] : []; });
  const [listings, aliasRows] = await Promise.all([
    prisma.storeProduct.findMany({ where: { retailer: "ALDI", externalId: { in: externalIds } }, select: { id: true, externalId: true, productId: true } }),
    prisma.productAlias.findMany({ where: { normalised: { in: [...new Set([...aliases, ...comparableKeys])] } }, select: { normalised: true, productId: true, product: { select: { category: true } } } }),
  ]);
  const listingById = new Map(listings.flatMap((listing) => listing.externalId ? [[listing.externalId, listing] as const] : []));
  const productByAlias = new Map(aliasRows.map((alias) => [alias.normalised, alias.productId]));
  const comparableCategories = new Map<string, Set<SupermarketDepartment>>();
  for (const alias of aliasRows) {
    if (!comparableKeys.includes(alias.normalised)) continue;
    const category = productDepartment(alias.product.category, "");
    if (category === "Other") continue;
    const categories = comparableCategories.get(alias.normalised) ?? new Set<SupermarketDepartment>();
    categories.add(category); comparableCategories.set(alias.normalised, categories);
  }
  return products.map<Plan>((product) => {
    const invalid = eligibility(product); if (invalid) return { product, disposition: "skip", reason: invalid, productId: null, storeProductId: null, category: null };
    const listing = listingById.get(product.externalId); if (listing) return { product, disposition: "retain", reason: "authoritative ALDI listing already exists", productId: listing.productId, storeProductId: listing.id, category: null };
    const alias = normaliseProductText(product.name); const productId = productByAlias.get(alias);
    if (productId) return { product, disposition: "link-name", reason: "exact normalised product name matches an existing Food alias", productId, storeProductId: randomUUID(), category: null };
    if (aliasesSeen.has(alias)) return { product, disposition: "skip", reason: "another record in this import has the same normalised name", productId: null, storeProductId: null, category: null };
    aliasesSeen.add(alias);
    return { product, disposition: "create", reason: "unique public ALDI catalogue identity; queued for later barcode verification", productId: randomUUID(), storeProductId: randomUUID(), category: categoryResolutionForImport(product.name, comparableCategories, product.categoryPath) };
  });
}

function listing(plan: Plan) { const product = plan.product; return { retailerProductName: product.name, brand: product.brand, packSize: product.packSize, productUrl: product.productUrl, imageUrl: product.imageUrl, aisle: product.categoryPath, active: true, lastSeenAt: new Date() }; }
async function attach(plans: Plan[]) {
  const applicable = plans.filter((plan) => plan.disposition !== "skip"); const creates = applicable.filter((plan) => plan.disposition === "create"); const newListings = applicable.filter((plan) => plan.disposition !== "retain"); const retained = applicable.filter((plan) => plan.disposition === "retain");
  await prisma.$transaction(async (tx) => {
    if (creates.length) {
      await tx.product.createMany({ data: creates.map((plan) => { const mapped = plan.category!; return { id: plan.productId!, name: plan.product.name, canonicalName: plan.product.name, slug: `${slugifyProductName(plan.product.name)}-aldi-${plan.product.externalId}`, brand: plan.product.brand, category: mapped.category, packSize: plan.product.packSize, imageUrl: plan.product.imageUrl, productType: mapped.productType, lifecycle: ProductLifecycle.REVIEW_REQUIRED, confidenceScore: 0.65 }; }) });
      await tx.productAlias.createMany({ data: creates.map((plan) => ({ productId: plan.productId!, alias: plan.product.name, normalised: normaliseProductText(plan.product.name), source: "aldi-controlled-import" })) });
    }
    if (newListings.length) await tx.storeProduct.createMany({ data: newListings.map((plan) => ({ id: plan.storeProductId!, productId: plan.productId!, retailer: "ALDI", externalId: plan.product.externalId, ...listing(plan) })) });
    for (const plan of retained) await tx.storeProduct.update({ where: { id: plan.storeProductId! }, data: listing(plan) });
    if (applicable.length) await tx.priceObservation.createMany({ data: applicable.map((plan) => ({ productId: plan.productId!, storeProductId: plan.storeProductId!, retailer: "ALDI", price: plan.product.price, isSpecial: false, source: "aldi-controlled-import", sourceUrl: plan.product.productUrl })) });
  }, { maxWait: 5_000, timeout: 60_000 });
}

async function main() {
  const counts: Record<ImportDisposition, number> = { retain: 0, "link-barcode": 0, "link-name": 0, create: 0, skip: 0 }; const categorySources = new Map<string, number>(); const skipReasons = new Map<string, number>(); const aliasesSeen = new Set<string>(); let offset = 0; let processed = 0; let pages = 0;
  while (true) { const page = await readPage(offset); if (!page.products.length && pages === 0) throw new Error("No ALDI cache records were returned."); const plans = await plansForPage(page.products, aliasesSeen); for (const plan of plans) { counts[plan.disposition] += 1; if (plan.category) categorySources.set(plan.category.source, (categorySources.get(plan.category.source) ?? 0) + 1); if (plan.disposition === "skip") skipReasons.set(plan.reason, (skipReasons.get(plan.reason) ?? 0) + 1); } if (apply && plans.length) await attach(plans); processed += plans.length; pages += 1; if (importAll && (processed % 1000 === 0 || page.nextOffset === null)) console.log(`Bulk progress: ${processed} records across ${pages} cache pages.`); if (!importAll || page.nextOffset === null) break; offset = page.nextOffset; }
  if (skipReasons.size) console.log(`Skip reasons: ${JSON.stringify(Object.fromEntries(skipReasons))}.`);
  if (categorySources.size) console.log(`Create-category evidence: ${JSON.stringify(Object.fromEntries(categorySources))}.`);
  console.log(`${apply ? "ALDI controlled import" : "ALDI import preview"} complete. ${JSON.stringify(counts)}.${apply ? "" : " No database changes were made."}`);
}
void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
