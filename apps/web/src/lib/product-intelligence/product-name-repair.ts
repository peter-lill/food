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

function safeLeadingPunctuationRepair(value: string) {
  const repaired = value.replace(/^\s*[.,;:|_-]+\s*(?=[A-Za-z0-9])/, "").trim();
  return repaired && repaired !== value.trim() ? repaired : null;
}

export async function repairContaminatedProductNames(limit = 500): Promise<ProductNameRepairResult> {
  const products = await prisma.product.findMany({
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(limit, 2000)),
    select: { id: true, name: true },
  });

  const items: ProductNameRepairResult["items"] = [];

  for (const product of products) {
    const validation = validateProductName(product.name);
    const safeRepair = safeLeadingPunctuationRepair(product.name);

    if (safeRepair) {
      const repairedValidation = validateProductName(safeRepair);
      if (repairedValidation.valid && !repairedValidation.changed && repairedValidation.sanitised === safeRepair) {
        await prisma.product.update({
          where: { id: product.id },
          data: { name: safeRepair },
        });
        items.push({
          productId: product.id,
          previousName: product.name,
          nextName: safeRepair,
          status: "repaired",
          issues: ["leading-punctuation"],
        });
        continue;
      }
    }

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

    // Broader sanitiser suggestions are review-only. They are never written automatically.
    items.push({
      productId: product.id,
      previousName: product.name,
      nextName: validation.sanitised,
      status: "review",
      issues: validation.issues.length ? validation.issues : ["name-invalid"],
    });
  }

  return {
    scanned: products.length,
    repaired: items.filter((item) => item.status === "repaired").length,
    reviewRequired: items.filter((item) => item.status === "review").length,
    items,
  };
}
