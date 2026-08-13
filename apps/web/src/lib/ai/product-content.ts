import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { aiComputeChat } from "./aicompute";
import { configuredProvider } from "./provider-settings";
import { parseGeneratedProductContent } from "./product-content-validation";

type Evidence = { name: string; canonicalName: string | null; brand: string | null; category: string | null; packSize: string | null; productType: string };

function evidenceHash(evidence: Evidence) {
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

export async function getOrGenerateProductContent(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, canonicalName: true, brand: true, category: true, packSize: true, productType: true, generatedContent: true } });
  if (!product) return null;
  const evidence: Evidence = { name: product.name, canonicalName: product.canonicalName, brand: product.brand, category: product.category, packSize: product.packSize, productType: product.productType };
  const hash = evidenceHash(evidence);
  if (product.generatedContent?.evidenceHash === hash) return product.generatedContent;

  const setting = await configuredProvider("aicompute");
  if (!setting) return product.generatedContent;
  const raw = await aiComputeChat(setting, [
    { role: "system", content: "Write concise Australian grocery product-page copy using only the supplied facts. Never invent ingredients, nutrition, allergens, origin, health claims, price, certifications or retailer claims. Return JSON with overview (string), uses (string array) and storage (string array). If safe storage cannot be inferred from the product type, return an empty storage array." },
    { role: "user", content: JSON.stringify(evidence) },
  ]);
  const generated = parseGeneratedProductContent(raw);
  return prisma.productGeneratedContent.upsert({
    where: { productId },
    create: { productId, ...generated, evidenceHash: hash, provider: "aicompute", model: setting.model },
    update: { ...generated, evidenceHash: hash, provider: "aicompute", model: setting.model },
  });
}
