import { prisma } from "../src/lib/prisma";
import { foodItemIdentity, isPlausibleGroceryName } from "../src/lib/products/food-item-intelligence";
import { formatProductName } from "../src/lib/products/product-formatter";
import { normaliseProductText, parseProductName } from "../src/lib/products/product-normalisation";

const apply = process.argv.includes("--apply");

type CleanupProduct = Awaited<ReturnType<typeof loadProducts>>[number];

type Evidence = {
  value: string;
  source: string;
  weight: number;
};

const technicalTokens = new Set([
  "css", "font", "style", "inherit", "weight", "webkit", "text", "decoration",
  "display", "flex", "grid", "margin", "padding", "border", "background", "colour",
  "color", "line", "height", "letter", "spacing", "align", "justify", "position",
  "absolute", "relative", "block", "inline", "overflow", "hidden", "visible", "transform",
  "transition", "opacity", "cursor", "pointer", "family", "size", "variant", "normal",
]);

const preparationTailTokens = new Set([
  "cored", "peeled", "unpeeled", "sliced", "diced", "chopped", "grated", "crushed",
  "drained", "rinsed", "trimmed", "halved", "quartered", "softened", "melted", "toasted",
  "roasted", "cooked", "seeded", "deseeded", "finely", "roughly", "thinly", "thickly",
  "lightly", "removed",
]);

const recipeMeasureTokens = new Set([
  "quantity", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "cup", "cups",
  "small", "medium", "large", "approximately", "approx", "spray",
]);

const danglingTokens = new Set([
  "and", "or", "with", "plus", "to", "serve", "approximately", "per", "of", "into",
]);

const recoveryCases: Array<[string, string]> = [
  [".Css 17zggtj Font Style Inherit Font Weight Inherit Webkit Text Decoration Inherit Text Decoration Inherit Apple Cored and", "apple"],
  [".Css 17zggtj Font Style Inherit Font Weight Inherit Webkit Text Decoration Inherit Text Decoration Inherit Brown Rice", "brown rice"],
  [".Css 17zggtj Font Style Inherit Font Weight Inherit Webkit Text Decoration Inherit Text Decoration Inherit Tablespoon Olive Oil", "olive oil"],
  [".Css 17zggtj Font Style Inherit Font Weight Inherit Webkit Text Decoration Inherit Text Decoration Inherit Teaspoon Baking Powder", "baking powder"],
  [".Css 17zggtj Font Style Inherit Font Weight Inherit Webkit Text Decoration Inherit Text Decoration Inherit Spaghetti", "spaghetti"],
];

function safeDerived(product: { barcode: string | null; storeProducts: { id: string }[] }) {
  return !product.barcode && product.storeProducts.length === 0;
}

async function foodKnowledgeFor(name: string) {
  const existing = await prisma.foodKnowledge.findFirst({
    where: { commonName: { equals: name, mode: "insensitive" } },
  });
  return existing ?? prisma.foodKnowledge.create({ data: { commonName: name } });
}

function recoverCandidateFromCorruptedName(value: string) {
  const normalised = normaliseProductText(value);
  const tokens = normalised.split(" ").filter(Boolean);
  const recovered: string[] = [];

  for (const token of tokens) {
    const mixedClassToken = /[a-z]/.test(token) && /\d/.test(token);
    if (mixedClassToken || technicalTokens.has(token)) continue;
    recovered.push(token);
  }

  let cleaned = recovered.join(" ")
    .replace(/^quantity\s+of\s+/, "")
    .replace(/\bcut\s+into\b.*$/, "")
    .replace(/\bhusks?\s+and\s+silk\s+removed\b.*$/, "")
    .replace(/\bcm\s+thick\s+slices?\b.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const cleanedTokens = cleaned
    .split(" ")
    .filter(Boolean)
    .filter((token, index) => !(recipeMeasureTokens.has(token) && index === 0))
    .filter((token) => !preparationTailTokens.has(token));

  while (cleanedTokens.length && danglingTokens.has(cleanedTokens.at(-1)!)) cleanedTokens.pop();
  while (cleanedTokens.length && recipeMeasureTokens.has(cleanedTokens[0])) cleanedTokens.shift();

  cleaned = cleanedTokens
    .filter((token, index, values) => !(danglingTokens.has(token) && (index === 0 || index === values.length - 1)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  // This is already a sanitised recovery candidate. Do not send it back through
  // foodItemIdentity(), because that function intentionally rejects suspicious
  // public input before parsing. Parse the clean tail directly instead.
  const identity = normaliseProductText(parseProductName(cleaned).canonicalName);
  return identity && isPlausibleGroceryName(identity) ? identity : null;
}

function verifyRecoveryParser() {
  for (const [input, expected] of recoveryCases) {
    const recovered = recoverCandidateFromCorruptedName(input);
    if (recovered !== expected) {
      throw new Error(`CSS recovery self-test failed: expected ${JSON.stringify(expected)}, received ${JSON.stringify(recovered)} for ${JSON.stringify(input)}.`);
    }
  }
}

function candidateFromEvidence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!isPlausibleGroceryName(trimmed)) {
    return recoverCandidateFromCorruptedName(trimmed);
  }

  const identity = foodItemIdentity(trimmed);
  if (!identity || !isPlausibleGroceryName(identity)) return null;
  return identity;
}

function repairEvidence(product: CleanupProduct): Evidence[] {
  return [
    ...product.ingredientRecords.map((record) => ({ value: record.name, source: "ingredient", weight: 100 })),
    ...product.receiptItems.flatMap((record) => [
      ...(record.normalisedName ? [{ value: record.normalisedName, source: "receipt-normalised", weight: 90 }] : []),
      { value: record.rawDescription, source: "receipt", weight: 45 },
    ]),
    ...product.shoppingItems.map((record) => ({ value: record.name, source: "shopping", weight: 75 })),
    ...product.storeProducts.map((record) => ({ value: record.retailerProductName, source: `retailer:${record.retailer}`, weight: 80 })),
    ...product.aliases.map((record) => ({ value: record.alias, source: `alias:${record.source ?? "unknown"}`, weight: 65 })),
    { value: product.name, source: "corrupted-name-tail", weight: 60 },
    ...(product.canonicalName && product.canonicalName !== product.name
      ? [{ value: product.canonicalName, source: "corrupted-canonical-tail", weight: 55 }]
      : []),
  ];
}

function inferRepair(product: CleanupProduct) {
  const scores = new Map<string, { score: number; sources: Set<string> }>();

  for (const evidence of repairEvidence(product)) {
    const identity = candidateFromEvidence(evidence.value);
    if (!identity) continue;
    const current = scores.get(identity) ?? { score: 0, sources: new Set<string>() };
    current.score += evidence.weight;
    current.sources.add(evidence.source);
    scores.set(identity, current);
  }

  return [...scores.entries()]
    .map(([identity, result]) => ({ identity, score: result.score, sources: [...result.sources] }))
    .sort((left, right) => right.score - left.score || right.sources.length - left.sources.length)[0] ?? null;
}

async function relinkAndArchive(sourceId: string, targetId: string, sourceName: string) {
  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.ingredient.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.shoppingItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.receiptItem.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.supermarketPrice.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.priceObservation.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.productEnrichmentJob.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.storeProduct.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
    await tx.productAlias.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });

    const normalised = normaliseProductText(sourceName);
    if (normalised && isPlausibleGroceryName(sourceName)) {
      await tx.productAlias.upsert({
        where: { normalised },
        update: { productId: targetId, alias: sourceName, source: "bulk-cleanup" },
        create: { productId: targetId, alias: sourceName, normalised, source: "bulk-cleanup" },
      });
    }

    await tx.product.update({
      where: { id: sourceId },
      data: {
        lifecycle: "ARCHIVED",
        confidenceScore: 0,
        foodKnowledgeId: null,
      },
    });
  });
}

async function repairInvalidProduct(product: CleanupProduct) {
  const repair = inferRepair(product);
  if (!repair) return { outcome: "unresolved" as const };

  const canonicalName = formatProductName(repair.identity);
  const target = await prisma.product.findFirst({
    where: {
      id: { not: product.id },
      lifecycle: { not: "ARCHIVED" },
      OR: [
        { canonicalName: { equals: canonicalName, mode: "insensitive" } },
        { name: { equals: canonicalName, mode: "insensitive" } },
      ],
    },
    orderBy: [{ barcode: "desc" }, { updatedAt: "desc" }],
  });

  if (!apply) {
    return { outcome: target ? "merge" as const : "repair" as const, canonicalName, repair };
  }

  if (target) {
    await relinkAndArchive(product.id, target.id, product.name);
    return { outcome: "merge" as const, canonicalName, repair };
  }

  const knowledge = await foodKnowledgeFor(canonicalName);
  await prisma.product.update({
    where: { id: product.id },
    data: {
      name: canonicalName,
      canonicalName,
      foodKnowledgeId: knowledge.id,
      lifecycle: "REVIEW_REQUIRED",
      confidenceScore: Math.min(0.95, repair.score / 200),
    },
  });

  return { outcome: "repair" as const, canonicalName, repair };
}

async function loadProducts() {
  return prisma.product.findMany({
    include: {
      storeProducts: { select: { id: true, retailer: true, retailerProductName: true } },
      ingredientRecords: { select: { name: true } },
      shoppingItems: { select: { name: true } },
      receiptItems: { select: { rawDescription: true, normalisedName: true } },
      aliases: { select: { alias: true, source: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function main() {
  verifyRecoveryParser();

  const products = await loadProducts();
  const summary = {
    scanned: products.length,
    invalid: 0,
    repaired: 0,
    unresolved: 0,
    updated: 0,
    merged: 0,
    unchanged: 0,
    failed: 0,
  };
  console.log(`${apply ? "Applying" : "Previewing"} Product Intelligence cleanup for ${products.length} product(s).`);

  for (const product of products) {
    const sourceName = product.canonicalName?.trim() || product.name.trim();

    try {
      if (!isPlausibleGroceryName(sourceName)) {
        summary.invalid += 1;
        const result = await repairInvalidProduct(product);
        if (result.outcome === "merge") {
          summary.merged += 1;
          console.log(`REPAIR+MERGE  ${product.name} -> ${result.canonicalName} [${result.repair.sources.join(", ")}]`);
        } else if (result.outcome === "repair") {
          summary.repaired += 1;
          console.log(`REPAIR        ${product.name} -> ${result.canonicalName} [${result.repair.sources.join(", ")}]`);
        } else {
          summary.unresolved += 1;
          console.log(`UNRESOLVED    ${product.name}`);
          if (apply) {
            await prisma.product.update({
              where: { id: product.id },
              data: { lifecycle: "REVIEW_REQUIRED", confidenceScore: 0 },
            });
          }
        }
        continue;
      }

      const identity = foodItemIdentity(sourceName);
      if (!identity) {
        summary.unchanged += 1;
        continue;
      }

      const canonicalName = formatProductName(identity);
      const changed = normaliseProductText(sourceName) !== identity;
      const target = await prisma.product.findFirst({
        where: {
          id: { not: product.id },
          lifecycle: { not: "ARCHIVED" },
          OR: [
            { canonicalName: { equals: canonicalName, mode: "insensitive" } },
            { name: { equals: canonicalName, mode: "insensitive" } },
          ],
        },
        include: { storeProducts: { select: { id: true } } },
        orderBy: [{ barcode: "desc" }, { updatedAt: "desc" }],
      });

      if (target && changed && safeDerived(product)) {
        console.log(`MERGE         ${product.name} -> ${canonicalName}`);
        summary.merged += 1;
        if (apply) await relinkAndArchive(product.id, target.id, product.name);
        continue;
      }

      const knowledge = apply ? await foodKnowledgeFor(canonicalName) : null;
      const needsUpdate = product.canonicalName !== canonicalName
        || Boolean(knowledge && product.foodKnowledgeId !== knowledge.id)
        || Boolean(changed && safeDerived(product) && product.name !== canonicalName);

      if (!needsUpdate) {
        summary.unchanged += 1;
        continue;
      }

      console.log(`UPDATE        ${product.name} -> ${canonicalName}`);
      summary.updated += 1;
      if (apply) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            name: changed && safeDerived(product) ? canonicalName : product.name,
            canonicalName,
            foodKnowledgeId: knowledge?.id,
          },
        });
      }
    } catch (error) {
      summary.failed += 1;
      console.error(`FAILED        ${product.id} ${product.name}`, error);
    }
  }

  console.table(summary);
  if (!apply) console.log("Preview only. Re-run with --apply to perform this cleanup automatically.");
}

main()
  .catch((error) => {
    console.error("Product Intelligence cleanup failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
