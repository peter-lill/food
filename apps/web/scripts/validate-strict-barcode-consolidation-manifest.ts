import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const MANIFEST_PATH = path.resolve(
  "scripts/manifests/strict-barcode-consolidation-20261007.json",
);
const FROZEN_SHA256 =
  "437aa1741a4b094dd65f748c716c45958d7ffd4aa70272e833d5c02efca34353";

type ExpectedCounts = {
  storeProducts: number;
  priceObservations: number;
  aliases: number;
  enrichmentJobs: number;
  inventoryItems: number;
  ingredientRecords: number;
  shoppingItems: number;
  receiptItems: number;
  supermarketPrices: number;
  generatedContent: number;
  foodKnowledge: number;
};

export type ConsolidationDecision = {
  sourceProductId: string;
  sourceName: string;
  sourceCanonicalName: string | null;
  sourceBrand: string | null;
  sourceBarcode: string | null;
  sourcePackSize: string | null;
  targetProductId: string;
  targetName: string;
  targetCanonicalName: string | null;
  targetBrand: string | null;
  targetBarcode: string;
  targetPackSize: string | null;
  expected: ExpectedCounts;
  storeProductIds: string[];
  aliasIds: string[];
  enrichmentJobIds: string[];
};

export type ConsolidationManifest = {
  schemaVersion: number;
  kind: string;
  totals: {
    decisions: number;
    storeProducts: number;
    priceObservations: number;
    aliases: number;
    enrichmentJobs: number;
  };
  decisions: ConsolidationDecision[];
};

export function loadFrozenManifest(): ConsolidationManifest {
  const bytes = fs.readFileSync(MANIFEST_PATH);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha !== FROZEN_SHA256) {
    throw new Error(
      `Frozen manifest SHA256 mismatch: expected ${FROZEN_SHA256}, got ${sha}`,
    );
  }
  return JSON.parse(bytes.toString("utf8")) as ConsolidationManifest;
}

function sameArray(a: string[], b: string[]) {
  return (
    a.length === b.length &&
    [...a].sort().every((value, index) => value === [...b].sort()[index])
  );
}

export async function validateManifestLiveState(
  manifest: ConsolidationManifest,
  options: { allowApplied?: boolean } = {},
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sources = manifest.decisions.map((d) => d.sourceProductId);
  const targets = manifest.decisions.map((d) => d.targetProductId);

  if (manifest.schemaVersion !== 1)
    errors.push(`schemaVersion must be 1, got ${manifest.schemaVersion}`);
  if (manifest.kind !== "strict-barcode-product-consolidation")
    errors.push(`unexpected manifest kind: ${manifest.kind}`);
  if (new Set(sources).size !== sources.length)
    errors.push("sourceProductId values are not unique");
  if (sources.some((id) => new Set(targets).has(id)))
    errors.push("a source Product is also a target Product");
  if (manifest.totals.decisions !== manifest.decisions.length)
    errors.push("manifest decision total does not match decisions length");

  const expectedTotals = manifest.decisions.reduce(
    (sum, d) => ({
      storeProducts: sum.storeProducts + d.expected.storeProducts,
      priceObservations:
        sum.priceObservations + d.expected.priceObservations,
      aliases: sum.aliases + d.expected.aliases,
      enrichmentJobs: sum.enrichmentJobs + d.expected.enrichmentJobs,
    }),
    { storeProducts: 0, priceObservations: 0, aliases: 0, enrichmentJobs: 0 },
  );
  for (const key of Object.keys(expectedTotals) as Array<
    keyof typeof expectedTotals
  >) {
    if (manifest.totals[key] !== expectedTotals[key])
      errors.push(`manifest total mismatch for ${key}`);
  }

  let alreadyApplied = 0;

  for (const d of manifest.decisions) {
    if (!d.targetBarcode || d.targetBarcode.replace(/\D/g, "").length < 7) {
      errors.push(`${d.sourceProductId}: target snapshot has no valid barcode`);
      continue;
    }

    const [source, target] = await Promise.all([
      prisma.product.findUnique({
        where: { id: d.sourceProductId },
        select: {
          id: true,
          name: true,
          canonicalName: true,
          brand: true,
          barcode: true,
          packSize: true,
          foodKnowledgeId: true,
          generatedContent: { select: { productId: true } },
          storeProducts: { select: { id: true } },
          aliases: { select: { id: true, normalised: true } },
          enrichmentJobs: { select: { id: true } },
          _count: {
            select: {
              storeProducts: true,
              priceObservations: true,
              aliases: true,
              enrichmentJobs: true,
              inventoryItems: true,
              ingredientRecords: true,
              shoppingItems: true,
              receiptItems: true,
              supermarketPrices: true,
            },
          },
        },
      }),
      prisma.product.findUnique({
        where: { id: d.targetProductId },
        select: {
          id: true,
          name: true,
          canonicalName: true,
          brand: true,
          barcode: true,
          packSize: true,
          aliases: { select: { normalised: true } },
        },
      }),
    ]);

    if (!source) {
      if (options.allowApplied && target) {
        alreadyApplied++;
        continue;
      }
      errors.push(`${d.sourceProductId}: source Product missing`);
      continue;
    }
    if (!target) {
      errors.push(`${d.sourceProductId}: target Product missing`);
      continue;
    }

    const sourceSnapshot = [
      ["name", source.name, d.sourceName],
      ["canonicalName", source.canonicalName, d.sourceCanonicalName],
      ["brand", source.brand, d.sourceBrand],
      ["barcode", source.barcode, d.sourceBarcode],
      ["packSize", source.packSize, d.sourcePackSize],
    ] as const;
    for (const [field, actual, expected] of sourceSnapshot) {
      if (actual !== expected)
        errors.push(`${d.sourceProductId}: source ${field} drift`);
    }

    const targetSnapshot = [
      ["name", target.name, d.targetName],
      ["canonicalName", target.canonicalName, d.targetCanonicalName],
      ["brand", target.brand, d.targetBrand],
      ["barcode", target.barcode, d.targetBarcode],
      ["packSize", target.packSize, d.targetPackSize],
    ] as const;
    for (const [field, actual, expected] of targetSnapshot) {
      if (actual !== expected)
        errors.push(`${d.sourceProductId}: target ${field} drift`);
    }

    const countChecks: Array<[string, number, number]> = [
      ["storeProducts", source._count.storeProducts, d.expected.storeProducts],
      [
        "priceObservations",
        source._count.priceObservations,
        d.expected.priceObservations,
      ],
      ["aliases", source._count.aliases, d.expected.aliases],
      ["enrichmentJobs", source._count.enrichmentJobs, d.expected.enrichmentJobs],
      ["inventoryItems", source._count.inventoryItems, 0],
      ["ingredientRecords", source._count.ingredientRecords, 0],
      ["shoppingItems", source._count.shoppingItems, 0],
      ["receiptItems", source._count.receiptItems, 0],
      ["supermarketPrices", source._count.supermarketPrices, 0],
      ["generatedContent", source.generatedContent ? 1 : 0, 0],
      ["foodKnowledge", source.foodKnowledgeId ? 1 : 0, 0],
    ];
    for (const [name, actual, expected] of countChecks) {
      if (actual !== expected)
        errors.push(
          `${d.sourceProductId}: ${name} expected ${expected}, got ${actual}`,
        );
    }

    if (!sameArray(source.storeProducts.map((x) => x.id), d.storeProductIds))
      errors.push(`${d.sourceProductId}: StoreProduct ID drift`);
    if (!sameArray(source.aliases.map((x) => x.id), d.aliasIds))
      errors.push(`${d.sourceProductId}: alias ID drift`);
    if (
      !sameArray(
        source.enrichmentJobs.map((x) => x.id),
        d.enrichmentJobIds,
      )
    )
      errors.push(`${d.sourceProductId}: enrichment-job ID drift`);

    const sourceObsForExpectedListings = await prisma.priceObservation.count({
      where: {
        productId: d.sourceProductId,
        storeProductId: { in: d.storeProductIds },
      },
    });
    if (sourceObsForExpectedListings !== d.expected.priceObservations) {
      errors.push(
        `${d.sourceProductId}: expected all ${d.expected.priceObservations} observations to belong to frozen StoreProducts, got ${sourceObsForExpectedListings}`,
      );
    }

    const targetAliasNames = new Set(target.aliases.map((a) => a.normalised));
    for (const alias of source.aliases) {
      if (targetAliasNames.has(alias.normalised))
        errors.push(
          `${d.sourceProductId}: target already owns alias ${alias.normalised}`,
        );
      const thirdParty = await prisma.productAlias.findFirst({
        where: {
          normalised: alias.normalised,
          productId: { notIn: [d.sourceProductId, d.targetProductId] },
        },
        select: { productId: true },
      });
      if (thirdParty)
        errors.push(
          `${d.sourceProductId}: alias ${alias.normalised} owned by third Product ${thirdParty.productId}`,
        );
    }
  }

  return { errors, warnings, alreadyApplied };
}

async function main() {
  const manifest = loadFrozenManifest();
  const result = await validateManifestLiveState(manifest);
  console.log("============================================================");
  console.log("STRICT BARCODE CONSOLIDATION VALIDATOR — READ ONLY");
  console.log("============================================================");
  console.log("Manifest SHA256:", FROZEN_SHA256);
  console.log("Decisions:", manifest.decisions.length);
  console.log("Errors:", result.errors.length);
  console.log("Warnings:", result.warnings.length);
  if (result.errors.length) console.dir(result.errors, { depth: null });
  console.log("Passed:", result.errors.length === 0);
  console.log("Database writes: 0");
  if (result.errors.length) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("validate-strict-barcode-consolidation-manifest.ts")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
