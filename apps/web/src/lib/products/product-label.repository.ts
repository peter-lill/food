import { prisma } from "@/lib/prisma";

export type ProductLabelSupplement = {
  ingredientsText: string | null;
  mayContainAllergens: string[];
};

export async function getProductLabelSupplement(productId: string): Promise<ProductLabelSupplement> {
  const rows = await prisma.$queryRaw<ProductLabelSupplement[]>`
    SELECT "ingredientsText", "mayContainAllergens"
    FROM "Product"
    WHERE "id" = ${productId}
    LIMIT 1
  `;
  return rows[0] ?? { ingredientsText: null, mayContainAllergens: [] };
}
