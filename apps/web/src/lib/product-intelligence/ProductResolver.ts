import {
  ProductLifecycle,
  ProductType,
  type Product,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  reason: "barcode" | "alias" | "exact-name" | "canonical-name" | "created" | "not-found";
};

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

export class ProductResolver {
  static async resolve(input: ResolveProductInput): Promise<ProductResolution> {
    const name = clean(input.name);
    if (!name) throw new Error("A product name is required for identity resolution.");

    const barcode = clean(input.barcode);
    if (barcode) {
      const byBarcode = await prisma.product.findUnique({ where: { barcode } });
      if (byBarcode) {
        return { product: byBarcode, created: false, confidence: 1, reason: "barcode" };
      }
    }

    const normalised = normaliseProductIdentity(name);
    const byAlias = await prisma.productAlias.findUnique({
      where: { normalised },
      include: { product: true },
    });
    if (byAlias) {
      return { product: byAlias.product, created: false, confidence: 0.98, reason: "alias" };
    }

    const exact = await prisma.product.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
    });
    if (exact) {
      return { product: exact, created: false, confidence: 0.95, reason: "exact-name" };
    }

    const canonical = await prisma.product.findFirst({
      where: { canonicalName: { equals: name, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
    });
    if (canonical) {
      return { product: canonical, created: false, confidence: 0.9, reason: "canonical-name" };
    }

    if (input.createIfMissing === false) {
      return { product: null, created: false, confidence: 0, reason: "not-found" };
    }

    const product = await prisma.$transaction(async (transaction) => {
      const created = await transaction.product.create({
        data: {
          name,
          canonicalName: name,
          barcode,
          brand: clean(input.brand),
          category: clean(input.category),
          productType: input.productType ?? ProductType.PACKAGED,
          lifecycle: ProductLifecycle.NEW,
          confidenceScore: barcode ? 0.75 : 0.5,
        },
      });

      if (normalised) {
        await transaction.productAlias.create({
          data: {
            productId: created.id,
            alias: name,
            normalised,
            source: clean(input.source) ?? "identity-resolver",
          },
        });
      }

      await transaction.productEnrichmentJob.create({
        data: {
          productId: created.id,
          provider: "default",
          priority: 100,
        },
      });

      return created;
    });

    return { product, created: true, confidence: barcode ? 0.75 : 0.5, reason: "created" };
  }
}
