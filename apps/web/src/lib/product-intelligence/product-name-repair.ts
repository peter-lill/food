import { prisma } from "@/lib/prisma";
import { validateProductName } from "@/lib/product-intelligence/product-name-quality";

export type ProductNameRepairResult = {
  scanned: number;
  repaired: number;
  reviewRequired: number;
  items: Array<{
    productId: string;
    previousName: string;
    nextName: string | null;
    status: "repaired" | "review" | "unchanged";
    issues: string[];
  }>;
};

export async function repairContaminatedProductNames(limit = 500): Promise<ProductNameRepairResult> {
  const products = await prisma.product.findMany({
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(limit, 2000)),
    select: { id: true, name: true },
  });

  const items: ProductNameRepairResult["items"] = [];

  for (const product of products) {
    const validation = validateProductName(product.name);
    if (!validation.changed && validation.valid) {
      items.push({
        productId: product.id,
        previousName: product.name,
        nextName: product.name,
        status: "unchanged",
        issues: validation.issues,
      });
      continue;
    }

    if (!validation.sanitised) {
      items.push({
        productId: product.id,
        previousName: product.name,
        nextName: null,
        status: "review",
        issues: validation.issues.length ? validation.issues : ["name-invalid"],
      });
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { name: validation.sanitised },
    });

    items.push({
      productId: product.id,
      previousName: product.name,
      nextName: validation.sanitised,
      status: "repaired",
      issues: validation.issues,
    });
  }

  return {
    scanned: products.length,
    repaired: items.filter((item) => item.status === "repaired").length,
    reviewRequired: items.filter((item) => item.status === "review").length,
    items,
  };
}
