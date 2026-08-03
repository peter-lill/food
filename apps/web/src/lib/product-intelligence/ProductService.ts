import { prisma } from "@/lib/prisma";
import type {
  CreateProductInput,
  ProductSearchOptions,
  UpdateProductInput,
} from "./types";

function normaliseTake(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.trunc(value), 1), 200);
}

function cleanOptional(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

export class ProductService {
  static findById(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: {
        foodKnowledge: true,
        aliases: true,
        storeProducts: true,
        priceObservations: {
          orderBy: { observedAt: "desc" },
          take: 20,
        },
      },
    });
  }

  static findByBarcode(barcode: string) {
    const cleaned = barcode.trim();
    if (!cleaned) return Promise.resolve(null);
    return prisma.product.findUnique({ where: { barcode: cleaned } });
  }

  static search(options: ProductSearchOptions = {}) {
    const query = options.query?.replace(/\s+/g, " ").trim();
    return prisma.product.findMany({
      where: {
        productType: options.productType,
        lifecycle: options.lifecycle,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" as const } },
                { canonicalName: { contains: query, mode: "insensitive" as const } },
                { brand: { contains: query, mode: "insensitive" as const } },
                { barcode: { contains: query } },
                { aliases: { some: { alias: { contains: query, mode: "insensitive" as const } } } },
              ],
            }
          : {}),
      },
      orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
      take: normaliseTake(options.take),
    });
  }

  static create(input: CreateProductInput) {
    const name = input.name.replace(/\s+/g, " ").trim();
    if (!name) throw new Error("Product name is required.");

    return prisma.product.create({
      data: {
        name,
        canonicalName: cleanOptional(input.canonicalName),
        slug: cleanOptional(input.slug),
        brand: cleanOptional(input.brand),
        barcode: cleanOptional(input.barcode),
        category: cleanOptional(input.category),
        description: cleanOptional(input.description),
        imageUrl: cleanOptional(input.imageUrl),
        packSize: cleanOptional(input.packSize),
        packQuantity: input.packQuantity,
        packUnit: cleanOptional(input.packUnit),
        productType: input.productType,
        lifecycle: input.lifecycle,
        confidenceScore: input.confidenceScore,
        foodKnowledgeId: input.foodKnowledgeId,
      },
    });
  }

  static update(id: string, changes: UpdateProductInput) {
    return prisma.product.update({ where: { id }, data: changes });
  }

  static findByAlias(alias: string) {
    const normalised = alias
      .toLocaleLowerCase("en-AU")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalised) return Promise.resolve(null);

    return prisma.productAlias.findUnique({
      where: { normalised },
      include: { product: true },
    });
  }
}
