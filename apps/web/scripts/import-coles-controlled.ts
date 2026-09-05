import "dotenv/config";

import { randomUUID } from "node:crypto";
import { Prisma, ProductLifecycle, ProductType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { classifyProductText } from "../src/lib/products/product-category";
import { normaliseProductText, slugifyProductName } from "../src/lib/products/product-normalisation";
import { retailerProductUrl } from "../src/lib/prices/coles-woolworths-provider";

const apply = process.argv.includes("--apply");
const importAll = process.argv.includes("--all");
const verbose = process.argv.includes("--verbose");
const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requestedLimit = Number(argument("--limit") ?? "30");
const requestedPageSize = Number(argument("--page-size") ?? "500");
const startOffset = Number(argument("--offset") ?? "0");
const category = argument("--category");
const pageSize = importAll
  ? Number.isInteger(requestedPageSize) && requestedPageSize >= 1 && requestedPageSize <= 1000 ? requestedPageSize : 500
  : Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 1000 ? requestedLimit : 30;

type CachedColesProduct = {
  externalId: string;
  name: string;
  barcode: string | null;
  price: number | null;
  isSpecial: boolean;
  packSize: string | null;
  imageUrl: string | null;
  brand: string | null;
  categoryPath: string | null;
  aisle: string | null;
  productUrl: string | null;
  inStock: boolean;
};

type Disposition = "retain" | "link-barcode" | "link-name" | "create" | "skip";
type Plan = { product: CachedColesProduct; disposition: Disposition; reason: string; productId: string | null; storeProductId: string | null };
type CacheResponse = { status?: unknown; products?: unknown; results?: unknown; nextOffset?: unknown; next_offset?: unknown; error?: unknown };

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null; }
function bool(value: unknown, defaultValue = false) { return typeof value === "boolean" ? value : typeof value === "number" ? value !== 0 : defaultValue; }
function cleanBarcode(value: string | null) { const digits = value?.replace(/\D/g, "") ?? ""; return digits.length >= 8 && digits.length <= 14 ? digits : null; }

function parseProduct(value: unknown): CachedColesProduct | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const externalId = text(input.externalId) ?? text(input.external_id) ?? text(input.productId) ?? text(input.product_id) ?? text(input.id);
  const name = text(input.name) ?? text(input.productName) ?? text(input.product_name);
  if (!externalId || !name) return null;
  return {
    externalId,
    name,
    barcode: text(input.barcode) ?? text(input.gtin),
    price: number(input.price) ?? number(input.currentPrice) ?? number(input.current_price),
    isSpecial: bool(input.isSpecial) || bool(input.is_special),
    packSize: text(input.packSize) ?? text(input.pack_size) ?? text(input.unit),
    imageUrl: text(input.imageUrl) ?? text(input.image_url),
    brand: text(input.brand),
    categoryPath: text(input.categoryPath) ?? text(input.category_path) ?? text(input.category),
    aisle: text(input.aisle) ?? text(input.shelf) ?? text(input.subcategory),
    productUrl: text(input.productUrl) ?? text(input.product_url),
    inStock: input.inStock === undefined && input.in_stock === undefined ? true : bool(input.inStock ?? input.in_stock),
  };
}

async function readPage(offset: number) {
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) throw new Error("GROCERY_MCP_BRIDGE_URL is required for the Coles catalogue cache.");
  const endpoints = ["/coles/catalogue/products", "/catalogue/products"];
  let lastError = "Coles catalogue endpoint unavailable.";
  for (const endpoint of endpoints) {
    const url = new URL(endpoint, bridgeUrl);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    if (endpoint === "/catalogue/products") url.searchParams.set("retailer", "coles");
    if (category) url.searchParams.set("category", category);
    try {
      const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as CacheResponse;
      const raw = Array.isArray(payload.products) ? payload.products : Array.isArray(payload.results) ? payload.results : null;
      if (!response.ok || !raw) {
        lastError = text(payload.error) ?? `${endpoint} returned HTTP ${response.status}`;
        continue;
      }
      const products = raw.flatMap((item) => { const parsed = parseProduct(item); return parsed ? [parsed] : []; });
      const candidateNext = typeof payload.nextOffset === "number" ? payload.nextOffset : typeof payload.next_offset === "number" ? payload.next_offset : null;
      const nextOffset = candidateNext !== null && Number.isInteger(candidateNext) && candidateNext > offset
        ? candidateNext
        : raw.length === pageSize ? offset + raw.length : null;
      return { products, nextOffset, endpoint };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Unable to read the Coles catalogue cache: ${lastError}`);
}

function productTypeFor(department: string, name: string): ProductType {
  if (department === "Fruit & vegetables") return ProductType.GENERIC_PRODUCE;
  if (department === "Bakery") return ProductType.BAKERY;
  if (department === "Dairy & eggs") return ProductType.DAIRY;
  if (department === "Frozen") return ProductType.FROZEN;
  if (department === "Household") return ProductType.HOUSEHOLD;
  if (department === "Health & personal care") return ProductType.PERSONAL_CARE;
  if (department === "Drinks" || department === "Beer, wine & spirits") return ProductType.BEVERAGE;
  if (department === "Meat & seafood") return /seafood|fish|salmon|prawn|tuna|oyster|mussel/i.test(name) ? ProductType.SEAFOOD : ProductType.FRESH_MEAT;
  if (["Home, kitchen & appliances", "Electronics & technology", "Garden & outdoor", "Automotive", "Tools & hardware", "Office & stationery", "Clothing, footwear & accessories", "Sport, fitness & recreation", "Toys, games & entertainment", "Furniture & homewares", "Seasonal", "General merchandise"].includes(department)) return ProductType.OTHER;
  return ProductType.PACKAGED;
}

async function plansForPage(products: CachedColesProduct[], plannedAliases: Set<string>, plannedBarcodes: Set<string>) {
  const ids = [...new Set(products.map((p) => p.externalId))];
  const barcodes = [...new Set(products.map((p) => cleanBarcode(p.barcode)).filter((v): v is string => Boolean(v)))];
  const aliases = [...new Set(products.map((p) => normaliseProductText(p.name)))];
  const [listings, barcodeProducts, aliasProducts] = await Promise.all([
    prisma.storeProduct.findMany({ where: { retailer: "Coles", externalId: { in: ids } }, select: { id: true, externalId: true, productId: true } }),
    barcodes.length ? prisma.product.findMany({ where: { barcode: { in: barcodes } }, select: { id: true, barcode: true } }) : [],
    aliases.length ? prisma.productAlias.findMany({ where: { normalised: { in: aliases } }, select: { normalised: true, productId: true } }) : [],
  ]);
  const listingById = new Map(listings.flatMap((v) => v.externalId ? [[v.externalId, v] as const] : []));
  const productByBarcode = new Map(barcodeProducts.flatMap((v) => v.barcode ? [[v.barcode, v.id] as const] : []));
  const productByAlias = new Map(aliasProducts.map((v) => [v.normalised, v.productId]));

  return products.map<Plan>((product) => {
    if (!product.inStock) return { product, disposition: "skip", reason: "not currently stocked", productId: null, storeProductId: null };
    const listing = listingById.get(product.externalId);
    if (listing) return { product, disposition: "retain", reason: "authoritative Coles listing already exists", productId: listing.productId, storeProductId: listing.id };
    const barcode = cleanBarcode(product.barcode);
    const barcodeProductId = barcode ? productByBarcode.get(barcode) : null;
    if (barcodeProductId) return { product, disposition: "link-barcode", reason: "exact barcode matches an existing Food product", productId: barcodeProductId, storeProductId: randomUUID() };
    const normalised = normaliseProductText(product.name);
    const aliasProductId = productByAlias.get(normalised);
    if (aliasProductId) return { product, disposition: "link-name", reason: "exact normalised name matches an existing Food alias", productId: aliasProductId, storeProductId: randomUUID() };
    if (!barcode) return { product, disposition: "skip", reason: "no barcode; canonical creation withheld for review", productId: null, storeProductId: null };
    if (plannedAliases.has(normalised) || plannedBarcodes.has(barcode)) return { product, disposition: "skip", reason: "duplicate identity within this import", productId: null, storeProductId: null };
    plannedAliases.add(normalised); plannedBarcodes.add(barcode);
    return { product, disposition: "create", reason: "unique Coles identity with barcode", productId: randomUUID(), storeProductId: randomUUID() };
  });
}

function listingData(product: CachedColesProduct) {
  return {
    retailerProductName: product.name,
    brand: product.brand,
    packSize: product.packSize,
    productUrl: product.productUrl ?? retailerProductUrl("Coles", product.name, product.externalId),
    imageUrl: product.imageUrl,
    aisle: product.categoryPath && product.aisle ? `${product.categoryPath} > ${product.aisle}` : product.aisle ?? product.categoryPath,
    active: true,
    lastSeenAt: new Date(),
  };
}

async function attachPage(plans: Plan[]) {
  const applicable = plans.filter((p) => p.disposition !== "skip");
  const creates = applicable.filter((p) => p.disposition === "create");
  const newListings = applicable.filter((p) => p.disposition !== "retain");
  const retained = applicable.filter((p) => p.disposition === "retain");
  await prisma.$transaction(async (tx) => {
    if (creates.length) {
      await tx.product.createMany({ data: creates.map((plan) => {
        const classification = classifyProductText(plan.product.name);
        return {
          id: plan.productId!, name: plan.product.name, canonicalName: plan.product.name,
          slug: `${slugifyProductName(plan.product.name)}-${plan.product.externalId}`,
          barcode: cleanBarcode(plan.product.barcode), brand: plan.product.brand,
          category: classification.department, imageUrl: plan.product.imageUrl, packSize: plan.product.packSize,
          productType: productTypeFor(classification.department, plan.product.name),
          lifecycle: ProductLifecycle.MATCHED, confidenceScore: classification.confidence === "high" ? 0.95 : 0.85,
        };
      }) });
      await tx.productAlias.createMany({ data: creates.map((plan) => ({ productId: plan.productId!, alias: plan.product.name, normalised: normaliseProductText(plan.product.name), source: "coles-controlled-import" })) });
    }
    if (newListings.length) {
      await tx.storeProduct.createMany({ data: newListings.map((plan) => ({ id: plan.storeProductId!, productId: plan.productId!, retailer: "Coles", externalId: plan.product.externalId, ...listingData(plan.product) })) });
    }
    for (const plan of retained) {
      await tx.storeProduct.update({ where: { id: plan.storeProductId! }, data: listingData(plan.product) });
    }
    const priced = applicable.filter((p) => p.product.price !== null);
    if (priced.length) await tx.priceObservation.createMany({ data: priced.map((plan) => ({
      productId: plan.productId!, storeProductId: plan.storeProductId!, retailer: "Coles", price: plan.product.price!,
      isSpecial: plan.product.isSpecial, source: "coles-controlled-import", sourceUrl: listingData(plan.product).productUrl,
    })) });
  }, { maxWait: 5_000, timeout: 60_000 });
}

async function main() {
  const counts: Record<Disposition, number> = { retain: 0, "link-barcode": 0, "link-name": 0, create: 0, skip: 0 };
  const skipReasons = new Map<string, number>();
  const plannedAliases = new Set<string>();
  const plannedBarcodes = new Set<string>();
  let offset = Number.isInteger(startOffset) && startOffset >= 0 ? startOffset : 0;
  let pages = 0; let processed = 0; let endpoint = "";
  while (true) {
    const page = await readPage(offset); endpoint = page.endpoint;
    if (!page.products.length && pages === 0) throw new Error("No Coles catalogue records were returned.");
    const plans = await plansForPage(page.products, plannedAliases, plannedBarcodes);
    for (const plan of plans) {
      counts[plan.disposition] += 1;
      if (plan.disposition === "skip") skipReasons.set(plan.reason, (skipReasons.get(plan.reason) ?? 0) + 1);
      if (verbose || !importAll || plan.disposition !== "retain") console.log(`${apply ? "Approved" : "Would"} ${plan.disposition}: ${plan.product.name} | ${plan.product.externalId} | ${plan.reason}`);
    }
    if (apply && plans.length) await attachPage(plans);
    processed += plans.length; pages += 1;
    if (importAll && (processed % 1000 < page.products.length || page.nextOffset === null)) console.log(`Coles progress: ${processed} records across ${pages} pages; next offset ${page.nextOffset ?? "complete"}.`);
    if (!importAll || page.nextOffset === null) break;
    offset = page.nextOffset;
  }
  if (skipReasons.size) console.log(`Skip reasons: ${JSON.stringify(Object.fromEntries([...skipReasons].sort((a, b) => b[1] - a[1])))}.`);
  console.log(`${apply ? "Coles import" : importAll ? "Coles bulk preview" : "Coles preview"} complete via ${endpoint}: ${JSON.stringify(counts)}; ${processed} records across ${pages} pages.`);
  if (!apply) console.log("Preview only. No database changes were made. Re-run with --apply only after reviewing these counts.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
