import {
  ProductLifecycle,
  ProductType,
  type Prisma,
  type Product,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseProductName } from "@/lib/products/product-normalisation";

export type ResolveProductInput = {
  name: string;
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
  source?: string | null;
  createIfMissing?: boolean;
  productType?: ProductType;
};

export type ProductResolution = {
  product: Product | null;
  created: boolean;
  confidence: number;
  reason: "barcode" | "alias" | "exact-name" | "canonical-family" | "canonical-name" | "created" | "not-found";
};

type ProductDatabase = Prisma.TransactionClient | typeof prisma;

const genericProduceNames = new Set([
  "Apple", "Avocado", "Banana", "Bean", "Beetroot", "Broccoli", "Button Mushroom",
  "Cabbage", "Capsicum", "Carrot", "Cauliflower", "Celery", "Cucumber", "Garlic",
  "Ginger", "Grape", "Lemon", "Lettuce", "Lime", "Mango", "Onion", "Orange",
  "Pear", "Potato", "Pumpkin", "Spinach", "Sweet Potato", "Tomato", "Watermelon", "Zucchini",
]);

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

export function normaliseProductIdentity(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function attachAlias(
  database: ProductDatabase,
  productId: string,
  alias: string,
  source: string,
) {
  const normalised = normaliseProductIdentity(alias);
  if (!normalised) return;
  await database.productAlias.upsert({
    where: { normalised },
    create: { productId, alias, normalised, source },
    update: { productId, alias, source },
  });
}

export class ProductResolver {
  static async resolve(
    input: ResolveProductInput,
    database: ProductDatabase = prisma,
  ): Promise<ProductResolution> {
    const name = clean(input.name);
    if (!name) throw new Error("A product name is required for identity resolution.");

    const barcode = clean(input.barcode);
    if (barcode) {
      const byBarcode = await database.product.findUnique({ where: { barcode } });
      if (byBarcode) {
        await attachAlias(database, byBarcode.id, name, clean(input.source) ?? "barcode-match");
        return { product: byBarcode, created: false, confidence: 1, reason: "barcode" };
      }
    }

    const normalised = normaliseProductIdentity(name);
    const byAlias = await database.productAlias.findUnique({
      where: { normalised },
      include: { product: true },
    });
    if (byAlias) {
      return { product: byAlias.product, created: false, confidence: 0.98, reason: "alias" };
    }

    const exact = await database.product.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
    });
    if (exact) {
      await attachAlias(database, exact.id, name, clean(input.source) ?? "exact-name");
      return { product: exact, created: false, confidence: 0.95, reason: "exact-name" };
    }

    const parsed = parseProductName(name);
    const canonicalName = parsed.canonicalName;
    const canonicalNormalised = normaliseProductIdentity(canonicalName);

    const canonicalAlias = await database.productAlias.findUnique({
      where: { normalised: canonicalNormalised },
      include: { product: true },
    });
    if (canonicalAlias) {
      await attachAlias(database, canonicalAlias.product.id, name, clean(input.source) ?? "canonical-family");
      return { product: canonicalAlias.product, created: false, confidence: 0.97, reason: "canonical-family" };
    }

    const canonical = await database.product.findFirst({
      where: {
        OR: [
          { canonicalName: { equals: canonicalName, mode: "insensitive" } },
          { name: { equals: canonicalName, mode: "insensitive" } },
        ],
      },
      orderBy: [{ confidenceScore: "desc" }, { createdAt: "asc" }],
    });
    if (canonical) {
      await attachAlias(database, canonical.id, name, clean(input.source) ?? "canonical-family");
      await attachAlias(database, canonical.id, canonicalName, "canonical-name");
      return { product: canonical, created: false, confidence: 0.95, reason: "canonical-family" };
    }

    if (input.createIfMissing === false) {
      return { product: null, created: false, confidence: 0, reason: "not-found" };
    }

    const genericProduce = genericProduceNames.has(canonicalName);
    const createProduct = async (transaction: ProductDatabase) => {
      const created = await transaction.product.create({
        data: {
          name: canonicalName,
          canonicalName,
          barcode,
          brand: genericProduce ? null : clean(input.brand),
          category: clean(input.category) ?? (genericProduce ? "Fresh produce" : null),
          imageUrl: canonicalName === "Button Mushroom" ? "/product-images/button-mushroom.svg" : null,
          productType: input.productType ?? (genericProduce ? ProductType.GENERIC_PRODUCE : ProductType.PACKAGED),
          lifecycle: ProductLifecycle.NEW,
          confidenceScore: barcode ? 0.75 : genericProduce ? 0.9 : 0.5,
        },
      });

      await attachAlias(transaction, created.id, name, clean(input.source) ?? "identity-resolver");
      await attachAlias(transaction, created.id, canonicalName, "canonical-name");

      await transaction.productEnrichmentJob.create({
        data: {
          productId: created.id,
          provider: "default",
          priority: 100,
        },
      });

      return created;
    };

    const product = database === prisma
      ? await prisma.$transaction((transaction) => createProduct(transaction))
      : await createProduct(database);

    return {
      product,
      created: true,
      confidence: barcode ? 0.75 : genericProduce ? 0.9 : 0.5,
      reason: "created",
    };
  }
}
