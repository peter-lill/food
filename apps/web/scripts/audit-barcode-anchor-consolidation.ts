import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  comparablePackSize,
  sameComparableRetailProduct,
} from "../src/lib/products/retailer-product-identity";
import { normaliseProductText } from "../src/lib/products/product-normalisation";
import {
  compatibleSellablePacks,
  sellablePackFacts,
} from "../src/lib/products/catalogue-sku-contamination";

type ProductRow = Awaited<ReturnType<typeof loadProducts>>[number];

function validBarcode(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

function brand(p: ProductRow) {
  return p.brand ?? p.storeProducts.find(s => s.brand)?.brand ?? null;
}

function pack(p: ProductRow) {
  return comparablePackSize(p.packSize)
    ?? comparablePackSize(p.name)
    ?? comparablePackSize(p.canonicalName)
    ?? p.storeProducts
      .map(s =>
        comparablePackSize(s.packSize)
        ?? comparablePackSize(s.retailerProductName)
      )
      .find(Boolean)
    ?? null;
}

function text(p: ProductRow) {
  return normaliseProductText([
    p.brand,
    p.name,
    p.canonicalName,
    ...p.storeProducts.flatMap(s => [s.brand, s.retailerProductName]),
  ].filter(Boolean).join(" "));
}

const noise = new Set([
  "soft", "drink", "drinks", "bottle", "bottles",
  "can", "cans", "pack", "packs", "pk", "each", "ea",
  "coles", "woolworths", "aldi", "drakes",
  "ml", "l", "g", "kg",
]);

function tokens(p: ProductRow) {
  return new Set(
    text(p)
      .split(" ")
      .filter(Boolean)
      .filter(t => !noise.has(t))
      .filter(t => !/^\d+(?:\.\d+)?$/.test(t))
  );
}

function overlap(a: Set<string>, b: Set<string>) {
  const shared = [...a].filter(x => b.has(x)).length;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

const variantTokens = [
  "max",
  "vanilla",
  "caffeine",
  "diet",
  "zero",
  "original",
  "light",
  "lite",
  "salted",
  "unsalted",
  "smoky",
  "smoked",
  "spicy",
  "mild",
  "hot",
  "dark",
  "milk",
  "white",
];

function conflict(anchor: ProductRow, candidate: ProductRow) {
  const aBarcode = validBarcode(anchor.barcode);
  const cBarcode = validBarcode(candidate.barcode);

  if (aBarcode && cBarcode && aBarcode !== cBarcode) {
    return "DIFFERENT_GTIN";
  }

  const aPack = pack(anchor);
  const cPack = pack(candidate);

  if (!aPack || !cPack || aPack !== cPack) {
    return "PACK";
  }

  const at = tokens(anchor);
  const ct = tokens(candidate);

  for (const token of variantTokens) {
    if (at.has(token) !== ct.has(token)) {
      return `VARIANT:${token}`;
    }
  }

  return null;
}

function strictMatch(anchor: ProductRow, candidate: ProductRow) {
  return sameComparableRetailProduct(
    {
      name: anchor.name,
      canonicalName: anchor.canonicalName,
      brand: brand(anchor),
      packSize: anchor.packSize
        ?? anchor.storeProducts.find(s => s.packSize)?.packSize
        ?? null,
      barcode: anchor.barcode,
    },
    {
      name: candidate.name,
      canonicalName: candidate.canonicalName,
      brand: brand(candidate),
      packSize: candidate.packSize
        ?? candidate.storeProducts.find(s => s.packSize)?.packSize
        ?? null,
      barcode: candidate.barcode,
    },
  );
}

function candidateEvidence(anchor: ProductRow, candidate: ProductRow) {
  const problem = conflict(anchor, candidate);
  if (problem) return null;

  if (validBarcode(candidate.barcode) === validBarcode(anchor.barcode)) {
    return { tier: "SAME_GTIN", score: 100 };
  }

  if (strictMatch(anchor, candidate)) {
    return { tier: "STRICT", score: 90 };
  }

  if (pack(anchor) !== pack(candidate)) return null;

  const score = overlap(tokens(anchor), tokens(candidate));

  // Discovery only. Intentionally high threshold.
  if (score >= 0.90) {
    return {
      tier: brand(candidate) ? "ANCHOR_DISCOVERY" : "LISTING_DISCOVERY",
      score: Math.round(score * 80),
    };
  }

  return null;
}

async function loadProducts() {
  return prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
      barcode: true,
      packSize: true,
      lifecycle: true,
      confidenceScore: true,
      createdAt: true,
      storeProducts: {
        where: { active: true },
        select: {
          id: true,
          retailer: true,
          externalId: true,
          retailerProductName: true,
          brand: true,
          packSize: true,
        },
      },
      _count: {
        select: {
          priceObservations: true,
          aliases: true,
          inventoryItems: true,
          ingredientRecords: true,
          shoppingItems: true,
          receiptItems: true,
          supermarketPrices: true,
          enrichmentJobs: true,
        },
      },
    },
  });
}

async function main() {
  const products = await loadProducts();

  const anchors = products.filter(p => validBarcode(p.barcode));

  const byPack = new Map<string, ProductRow[]>();
  for (const p of products) {
    const key = pack(p);
    if (!key) continue;
    byPack.set(key, [...(byPack.get(key) ?? []), p]);
  }

  const groups = [];

  for (const anchor of anchors) {
    const anchorPack = pack(anchor);
    if (!anchorPack) continue;

    const members = [];

    for (const candidate of byPack.get(anchorPack) ?? []) {
      if (candidate.id === anchor.id) continue;

      // Never allow a different known GTIN into an anchor group.
      const cBarcode = validBarcode(candidate.barcode);
      if (cBarcode && cBarcode !== validBarcode(anchor.barcode)) continue;

      const evidence = candidateEvidence(anchor, candidate);
      if (!evidence) continue;

      members.push({ product: candidate, evidence });
    }

    if (members.length) {
      groups.push({ anchor, members });
    }
  }

  groups.sort((a, b) =>
    b.members.length - a.members.length
    || b.anchor.confidenceScore - a.anchor.confidenceScore
  );

  console.log("============================================================");
  console.log("BARCODE-ANCHORED CONSOLIDATION AUDIT — READ ONLY");
  console.log("============================================================");
  console.log("Products scanned:", products.length);
  console.log("Barcode anchors:", anchors.length);
  console.log("Anchor groups:", groups.length);

  const tierCounts = new Map<string, number>();
  for (const g of groups) {
    for (const m of g.members) {
      tierCounts.set(
        m.evidence.tier,
        (tierCounts.get(m.evidence.tier) ?? 0) + 1
      );
    }
  }
  console.log("Candidate tiers:", Object.fromEntries(tierCounts));


  const strictRows = groups.flatMap(g =>
    g.members
      .filter(m => m.evidence.tier === "STRICT")
      .map(m => ({
        anchorId: g.anchor.id,
        anchorName: g.anchor.name,
        anchorCanonicalName: g.anchor.canonicalName,
        anchorBrand: brand(g.anchor),
        anchorBarcode: g.anchor.barcode,
        anchorPack: pack(g.anchor),
        anchorRetailers: g.anchor.storeProducts.map(s => s.retailer).join("|"),
        candidateId: m.product.id,
        candidateName: m.product.name,
        candidateCanonicalName: m.product.canonicalName,
        candidateBrand: brand(m.product),
        candidateBarcode: m.product.barcode,
        candidatePack: pack(m.product),
        candidateRetailers: m.product.storeProducts.map(s => s.retailer).join("|"),
        observations: m.product._count.priceObservations,
      }))
  );

  const csvEscape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const csvHeaders = [
    "anchorId",
    "anchorName",
    "anchorCanonicalName",
    "anchorBrand",
    "anchorBarcode",
    "anchorPack",
    "anchorRetailers",
    "candidateId",
    "candidateName",
    "candidateCanonicalName",
    "candidateBrand",
    "candidateBarcode",
    "candidatePack",
    "candidateRetailers",
    "observations",
  ];

  const csv = [
    csvHeaders.join(","),
    ...strictRows.map(row =>
      csvHeaders
        .map(key => csvEscape(row[key as keyof typeof row]))
        .join(",")
    ),
  ].join("\n");

  const fs = await import("node:fs/promises");
  await fs.writeFile(
    "/tmp/strict-barcode-anchor-candidates.csv",
    csv + "\n",
    "utf8"
  );

  console.log("STRICT relationships written:", strictRows.length);
  console.log("STRICT CSV: /tmp/strict-barcode-anchor-candidates.csv");

  function packRepresentations(p: ProductRow) {
    return [
      {
        source: "PRODUCT",
        id: p.id,
        packSize: p.packSize,
        retailerProductName: p.name,
      },
      ...p.storeProducts.map(sp => ({
        source: sp.retailer,
        id: sp.id,
        packSize: sp.packSize,
        retailerProductName: sp.retailerProductName,
      })),
    ];
  }

  const strictPackAudit = strictRows.map(row => {
    const anchor = products.find(p => p.id === row.anchorId)!;
    const candidate = products.find(p => p.id === row.candidateId)!;

    const anchorRepresentations = packRepresentations(anchor);
    const candidateRepresentations = packRepresentations(candidate);

    const conflicts: Array<{
      anchorSource: string;
      anchorText: string;
      anchorFacts: ReturnType<typeof sellablePackFacts>;
      candidateSource: string;
      candidateText: string;
      candidateFacts: ReturnType<typeof sellablePackFacts>;
    }> = [];

    for (const left of anchorRepresentations) {
      for (const right of candidateRepresentations) {
        if (!compatibleSellablePacks(left, right)) {
          conflicts.push({
            anchorSource: left.source,
            anchorText: `${left.packSize ?? ""} :: ${left.retailerProductName}`,
            anchorFacts: sellablePackFacts(left),
            candidateSource: right.source,
            candidateText: `${right.packSize ?? ""} :: ${right.retailerProductName}`,
            candidateFacts: sellablePackFacts(right),
          });
        }
      }
    }

    return {
      anchorId: row.anchorId,
      anchorName: row.anchorName,
      anchorBarcode: row.anchorBarcode,
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      safe: conflicts.length === 0,
      conflicts,
    };
  });

  const packSafe = strictPackAudit.filter(x => x.safe);
  const packConflict = strictPackAudit.filter(x => !x.safe);

  console.log("\nSTRICT SELLABLE-PACK AUDIT");
  console.log("Pack-safe:", packSafe.length);
  console.log("Pack-conflicting:", packConflict.length);

  for (const item of packConflict) {
    console.log("\nPACK CONFLICT");
    console.log({
      anchorId: item.anchorId,
      anchorName: item.anchorName,
      anchorBarcode: item.anchorBarcode,
      candidateId: item.candidateId,
      candidateName: item.candidateName,
    });

    for (const conflict of item.conflicts) {
      console.log(conflict);
    }
  }


  console.log("\nPEPSI MAX 600mL ANCHOR");
  const pepsi = groups.find(
    g => g.anchor.id === "6545ccde-5426-4eaf-9f5f-78bef417a02d"
  );

  if (!pepsi) {
    console.log("NOT FOUND");
  } else {
    console.log({
      anchor: {
        id: pepsi.anchor.id,
        name: pepsi.anchor.name,
        barcode: pepsi.anchor.barcode,
        pack: pack(pepsi.anchor),
      },
      members: pepsi.members.map(m => ({
        id: m.product.id,
        name: m.product.name,
        brand: brand(m.product),
        pack: pack(m.product),
        retailers: m.product.storeProducts.map(s => s.retailer),
        tier: m.evidence.tier,
        score: m.evidence.score,
      })),
    });
  }

  console.log("\nTOP 50 ANCHOR GROUPS");

  for (const g of groups.slice(0, 50)) {
    console.log("\n------------------------------------------------------------");
    console.log({
      anchor: g.anchor.id,
      name: g.anchor.name,
      barcode: g.anchor.barcode,
      pack: pack(g.anchor),
      members: g.members.length,
    });

    for (const m of g.members) {
      console.log({
        id: m.product.id,
        name: m.product.name,
        brand: brand(m.product),
        retailers: m.product.storeProducts.map(s => s.retailer),
        tier: m.evidence.tier,
        score: m.evidence.score,
      });
    }
  }

  console.log("\nREAD ONLY: no database records were changed.");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
