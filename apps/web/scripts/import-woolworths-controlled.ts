import "dotenv/config";

import { ProductLifecycle } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { normaliseProductText, slugifyProductName } from "../src/lib/products/product-normalisation";
import {
  categoryForWoolworthsPath,
  cleanBarcode,
  importEligibility,
  type CachedWoolworthsProduct,
  type ImportDisposition,
} from "./woolworths-controlled-import-matching";

const apply = process.argv.includes("--apply");
const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requestedLimit = Number(argument("--limit") ?? "30");
const offset = Number(argument("--offset") ?? "0");
const category = argument("--category");
const limit = Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 100 ? requestedLimit : 30;

type CachedResponse = { status?: unknown; products?: unknown; error?: unknown };
type Plan = {
  product: CachedWoolworthsProduct;
  disposition: ImportDisposition;
  reason: string;
  productId: string | null;
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
    barcode: text(input.barcode), price: number(input.price), pack_size: text(input.pack_size), image_url: text(input.image_url),
    in_stock: input.in_stock === false || input.in_stock === 0 ? 0 : 1,
    brand: text(input.brand), description: text(input.description), long_description: text(input.long_description),
    allergens: input.allergens, dietary_claims: input.dietary_claims,
    detail_refreshed_at: typeof input.detail_refreshed_at === "number" ? input.detail_refreshed_at : null,
  };
}

async function readCachedProducts() {
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) throw new Error("GROCERY_MCP_BRIDGE_URL is required for the verified Woolworths cache.");
  const url = new URL("/woolworths/catalogue/products", bridgeUrl);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(Number.isInteger(offset) && offset >= 0 ? offset : 0));
  if (category) url.searchParams.set("category", category);
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({})) as CachedResponse;
  if (!response.ok || payload.status !== "success" || !Array.isArray(payload.products)) {
    throw new Error(text(payload.error) ?? `Woolworths cache returned HTTP ${response.status}.`);
  }
  return payload.products.flatMap((item) => {
    const product = cachedProduct(item);
    return product ? [product] : [];
  });
}

async function planFor(product: CachedWoolworthsProduct): Promise<Plan> {
  const eligibility = importEligibility(product);
  if (!eligibility.eligible) return { product, disposition: "skip", reason: eligibility.reason!, productId: null };
  const existingListing = await prisma.storeProduct.findUnique({
    where: { retailer_externalId: { retailer: "Woolworths", externalId: product.stockcode } }, select: { productId: true },
  });
  if (existingListing) return { product, disposition: "retain", reason: "authoritative Woolworths listing already exists", productId: existingListing.productId };
  const barcode = cleanBarcode(product.barcode);
  if (barcode) {
    const existingBarcode = await prisma.product.findUnique({ where: { barcode }, select: { id: true } });
    if (existingBarcode) return { product, disposition: "link-barcode", reason: "exact barcode matches an existing Food product", productId: existingBarcode.id };
  }
  const alias = await prisma.productAlias.findUnique({ where: { normalised: normaliseProductText(product.name) }, select: { productId: true } });
  if (alias) return { product, disposition: "link-name", reason: "exact normalised product name matches an existing Food alias", productId: alias.productId };
  if (!barcode) return { product, disposition: "skip", reason: "no barcode; creation is intentionally withheld", productId: null };
  return { product, disposition: "create", reason: "verified detail and a unique barcode", productId: null };
}

async function attach(plan: Plan) {
  const { product } = plan;
  const mapped = categoryForWoolworthsPath(product.category_path);
  const barcode = cleanBarcode(product.barcode);
  return prisma.$transaction(async (tx) => {
    let productId = plan.productId;
    if (plan.disposition === "create") {
      const created = await tx.product.create({
        data: {
          name: product.name, canonicalName: product.name,
          slug: `${slugifyProductName(product.name)}-${product.stockcode}`,
          barcode, brand: product.brand, category: mapped.category,
          description: product.long_description ?? product.description,
          imageUrl: product.image_url, packSize: product.pack_size,
          productType: mapped.productType, lifecycle: ProductLifecycle.MATCHED, confidenceScore: 0.99,
        }, select: { id: true },
      });
      productId = created.id;
      await tx.productAlias.create({
        data: { productId, alias: product.name, normalised: normaliseProductText(product.name), source: "woolworths-controlled-import" },
      });
    }
    if (!productId) throw new Error(`No Food product selected for Woolworths stockcode ${product.stockcode}.`);
    const listing = await tx.storeProduct.upsert({
      where: { retailer_externalId: { retailer: "Woolworths", externalId: product.stockcode } },
      create: {
        productId, retailer: "Woolworths", externalId: product.stockcode, retailerProductName: product.name,
        brand: product.brand, packSize: product.pack_size,
        productUrl: `https://www.woolworths.com.au/shop/productdetails/${product.stockcode}`,
        imageUrl: product.image_url, active: true, lastSeenAt: new Date(),
      },
      update: {
        retailerProductName: product.name, brand: product.brand, packSize: product.pack_size,
        productUrl: `https://www.woolworths.com.au/shop/productdetails/${product.stockcode}`,
        imageUrl: product.image_url, active: true, lastSeenAt: new Date(),
      }, select: { id: true },
    });
    if (product.price !== null) {
      await tx.priceObservation.create({
        data: {
          productId, storeProductId: listing.id, retailer: "Woolworths", price: product.price,
          isSpecial: false, source: "woolworths-controlled-import",
          sourceUrl: `https://www.woolworths.com.au/shop/productdetails/${product.stockcode}`,
        },
      });
    }
    return productId;
  });
}

async function main() {
  const products = await readCachedProducts();
  if (!products.length) throw new Error("No verified Woolworths cache records were returned for this batch.");
  const plans: Plan[] = [];
  const plannedAliases = new Set<string>();
  for (const product of products) {
    const plan = await planFor(product);
    const alias = normaliseProductText(product.name);
    if (plan.disposition === "create" && plannedAliases.has(alias)) {
      plans.push({ ...plan, disposition: "skip", reason: "another record in this batch has the same normalised name" });
      continue;
    }
    if (plan.disposition === "create") plannedAliases.add(alias);
    plans.push(plan);
  }
  for (const plan of plans) console.log(`${apply ? "Approved" : "Would"} ${plan.disposition}: ${plan.product.name} | ${plan.product.stockcode} | ${plan.reason}`);
  const counts = Object.fromEntries(["retain", "link-barcode", "link-name", "create", "skip"].map((key) => [key, plans.filter((plan) => plan.disposition === key).length]));
  if (!apply) return console.log(`Preview complete. ${JSON.stringify(counts)}. No database changes were made.`);
  for (const plan of plans) {
    // Retained listings still receive the current verified price and retailer
    // metadata. Only explicitly unsafe candidates are left untouched.
    if (plan.disposition !== "skip") await attach(plan);
  }
  console.log(`Woolworths controlled import complete. ${JSON.stringify(counts)}.`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
