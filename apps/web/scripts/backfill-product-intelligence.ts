import { prisma } from "../src/lib/prisma";
import {
  normaliseProductText,
  parseProductName,
} from "../src/lib/products/product-normalisation";

const apply = process.argv.includes("--apply");

type SourceRecord = {
  id: string;
  name: string;
  source: "ingredient" | "shopping" | "receipt";
};

type BackfillAction = "create" | "link";

type BackfillResult = {
  action: BackfillAction;
  productId: string | null;
  productName: string;
  parsed: ReturnType<typeof parseProductName>;
};

type BackfillSummary = {
  total: number;
  create: number;
  link: number;
  ingredient: number;
  shopping: number;
  receipt: number;
  failed: number;
};

function uniqueAliases(values: string[]) {
  const aliases = new Map<string, string>();

  for (const value of values) {
    const normalised = normaliseProductText(value);
    if (normalised && !aliases.has(normalised)) aliases.set(normalised, value.trim());
  }

  return [...aliases.entries()].map(([normalised, alias]) => ({ alias, normalised }));
}

async function sourceRecords(): Promise<SourceRecord[]> {
  const [ingredients, shoppingItems, receiptItems] = await Promise.all([
    prisma.ingredient.findMany({
      where: { productId: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.shoppingItem.findMany({
      where: { productId: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.receiptItem.findMany({
      where: {
        productId: null,
        OR: [
          { normalisedName: { not: null } },
          { rawDescription: { not: "" } },
        ],
      },
      select: { id: true, normalisedName: true, rawDescription: true },
      orderBy: { rawDescription: "asc" },
    }),
  ]);

  return [
    ...ingredients.map((record) => ({ ...record, source: "ingredient" as const })),
    ...shoppingItems.map((record) => ({ ...record, source: "shopping" as const })),
    ...receiptItems.map((record) => ({
      id: record.id,
      name: record.normalisedName?.trim() || record.rawDescription,
      source: "receipt" as const,
    })),
  ];
}

async function findExistingProduct(slug: string, aliases: string[]) {
  const normalisedAliases = uniqueAliases(aliases).map((entry) => entry.normalised);

  return prisma.product.findFirst({
    where: {
      OR: [
        { slug },
        { aliases: { some: { normalised: { in: normalisedAliases } } } },
      ],
    },
    select: { id: true, name: true, slug: true },
  });
}

async function createOrUpdateProduct(record: SourceRecord): Promise<BackfillResult> {
  const parsed = parseProductName(record.name);
  const existing = await findExistingProduct(parsed.slug, parsed.aliases);
  const action: BackfillAction = existing ? "link" : "create";

  if (!apply) {
    return {
      action,
      productId: existing?.id ?? null,
      productName: existing?.name ?? parsed.canonicalName,
      parsed,
    };
  }

  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data: {
          canonicalName: existing.name === parsed.canonicalName
            ? parsed.canonicalName
            : undefined,
          slug: existing.slug ?? parsed.slug,
        },
      })
    : await prisma.product.create({
        data: {
          name: parsed.canonicalName,
          canonicalName: parsed.canonicalName,
          slug: parsed.slug,
          packQuantity: parsed.packQuantity,
          packUnit: parsed.packUnit,
        },
      });

  for (const alias of uniqueAliases(parsed.aliases)) {
    await prisma.productAlias.upsert({
      where: { normalised: alias.normalised },
      update: { productId: product.id, alias: alias.alias },
      create: {
        productId: product.id,
        alias: alias.alias,
        normalised: alias.normalised,
        source: record.source,
      },
    });
  }

  if (record.source === "ingredient") {
    await prisma.ingredient.update({
      where: { id: record.id },
      data: { productId: product.id },
    });
  } else if (record.source === "shopping") {
    await prisma.shoppingItem.update({
      where: { id: record.id },
      data: { productId: product.id },
    });
  } else {
    await prisma.receiptItem.update({
      where: { id: record.id },
      data: { productId: product.id },
    });
  }

  return {
    action,
    productId: product.id,
    productName: product.name,
    parsed,
  };
}

async function main() {
  const records = await sourceRecords();
  const summary: BackfillSummary = {
    total: records.length,
    create: 0,
    link: 0,
    ingredient: 0,
    shopping: 0,
    receipt: 0,
    failed: 0,
  };

  console.log(apply ? "Applying Product Intelligence backfill..." : "Product Intelligence dry run...");
  console.log(`Records without a product link: ${records.length}`);

  for (const [index, record] of records.entries()) {
    try {
      const result = await createOrUpdateProduct(record);
      summary[result.action] += 1;
      summary[record.source] += 1;

      console.log(
        `[${index + 1}/${records.length}] ${record.source}: ${record.name} -> ${result.productName}` +
          ` (${result.action})`,
      );
    } catch (error) {
      summary.failed += 1;
      console.error(
        `[${index + 1}/${records.length}] FAILED ${record.source}: ${record.name}`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("\nSummary");
  console.table(summary);

  if (!apply) {
    console.log("\nNo database changes were made. Run with --apply after reviewing the dry run.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
