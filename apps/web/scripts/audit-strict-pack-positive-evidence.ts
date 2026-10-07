import "dotenv/config";
import fs from "node:fs";
import { prisma } from "../src/lib/prisma";
import {
  sellablePackFacts,
  compatibleSellablePacks,
} from "../src/lib/products/catalogue-sku-contamination";

type Rep = {
  source: string;
  packSize: string | null;
  retailerProductName: string;
};

function values(reps: Rep[]) {
  const facts = reps.map(sellablePackFacts);

  const unique = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

  return {
    counts: unique(facts.flatMap(f => f.counts)),
    unitWeightsG: unique(facts.flatMap(f => f.unitWeightsG)),
    totalWeightsG: unique(facts.flatMap(f => f.totalWeightsG)),
    standaloneWeightsG: unique(facts.flatMap(f => f.standaloneWeightsG)),
    unitVolumesMl: unique(facts.flatMap(f => f.unitVolumesMl)),
    totalVolumesMl: unique(facts.flatMap(f => f.totalVolumesMl)),
    standaloneVolumesMl: unique(facts.flatMap(f => f.standaloneVolumesMl)),
  };
}

function sameKnown(a: number[], b: number[]) {
  return a.length > 0 && b.length > 0 && a.some(x => b.includes(x));
}

function contradictKnown(a: number[], b: number[]) {
  return a.length > 0 && b.length > 0 && !a.some(x => b.includes(x));
}

async function main() {
  const ids = JSON.parse(
    fs.readFileSync("/tmp/strict-product-ids.json", "utf8")
  ) as string[];

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      packSize: true,
      storeProducts: {
        where: { active: true },
        select: {
          id: true,
          retailer: true,
          retailerProductName: true,
          packSize: true,
        },
      },
    },
  });

  const byId = new Map(products.map(p => [p.id, p]));

  const csv = fs.readFileSync(
    "/tmp/strict-barcode-anchor-candidates.csv",
    "utf8"
  );

  // Small CSV parser sufficient here because Python also emits a JSON form below.
  const { execFileSync } = await import("node:child_process");

  execFileSync(
    "python3",
    [
      "-c",
      `
import csv,json
with open("/tmp/strict-barcode-anchor-candidates.csv", newline="", encoding="utf-8") as f:
    print(json.dumps(list(csv.DictReader(f))))
`,
    ],
    { encoding: "utf8" }
  );

  const rows = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import csv,json
with open("/tmp/strict-barcode-anchor-candidates.csv", newline="", encoding="utf-8") as f:
    print(json.dumps(list(csv.DictReader(f))))
`,
      ],
      { encoding: "utf8" }
    )
  );

  const results = [];

  for (const row of rows) {
    const a = byId.get(row.anchorId)!;
    const c = byId.get(row.candidateId)!;

    const reps = (p: typeof a): Rep[] => [
      {
        source: "PRODUCT",
        packSize: p.packSize,
        retailerProductName: p.name,
      },
      ...p.storeProducts.map(sp => ({
        source: `${sp.retailer}:${sp.id}`,
        packSize: sp.packSize,
        retailerProductName: sp.retailerProductName,
      })),
    ];

    const ar = reps(a);
    const cr = reps(c);
    const af = values(ar);
    const cf = values(cr);

    const compatible = ar.every(left =>
      cr.every(right => compatibleSellablePacks(left, right))
    );

    const countStatus =
      contradictKnown(af.counts, cf.counts)
        ? "CONFLICT"
        : af.counts.length && !cf.counts.length
          ? "ANCHOR_COUNT_MISSING_CANDIDATE"
          : !af.counts.length && cf.counts.length
            ? "CANDIDATE_COUNT_MISSING_ANCHOR"
            : sameKnown(af.counts, cf.counts)
              ? "MATCH"
              : "BOTH_UNKNOWN";

    results.push({
      anchorId: row.anchorId,
      anchorName: row.anchorName,
      anchorBarcode: row.anchorBarcode,
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      compatible,
      countStatus,
      anchorFacts: af,
      candidateFacts: cf,
    });
  }

  const counts = new Map<string, number>();
  for (const r of results) {
    counts.set(r.countStatus, (counts.get(r.countStatus) ?? 0) + 1);
  }

  console.log("============================================================");
  console.log("STRICT POSITIVE PACK-EVIDENCE AUDIT — READ ONLY");
  console.log("============================================================");
  console.log("Relationships:", results.length);
  console.log("Compatibility failures:", results.filter(r => !r.compatible).length);
  console.log("Count evidence:", Object.fromEntries(counts));

  const uncertain = results.filter(r =>
    r.countStatus === "ANCHOR_COUNT_MISSING_CANDIDATE" ||
    r.countStatus === "CANDIDATE_COUNT_MISSING_ANCHOR" ||
    r.countStatus === "CONFLICT"
  );

  console.log("Count-uncertain/conflicting:", uncertain.length);

  for (const r of uncertain.slice(0, 100)) {
    console.log("\n------------------------------------------------------------");
    console.dir(r, { depth: null });
  }

  const jin = results.filter(r =>
    r.anchorId === "3fcadddc-c0ae-4e26-b6ba-3d70198833f1" ||
    r.anchorId === "a52a6634-c505-427e-94b8-5d5350a839b5" ||
    r.candidateId === "c8f211c4-bdb2-4d2c-9ef6-81a7f05d560b"
  );

  console.log("\nJIN RAMEN CHECK");
  for (const r of jin) {
    console.dir(r, { depth: null });
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
