import { prisma } from "@/lib/prisma";
import type { ProductCatalogueItem } from "./product-catalogue.types";

export async function getProductCatalogue(): Promise<ProductCatalogueItem[]> {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      barcode: true,
    },
    orderBy: [{ name: "asc" }, { brand: "asc" }],
  });

  return products;
}
