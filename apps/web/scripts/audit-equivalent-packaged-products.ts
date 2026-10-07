import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  comparablePackSize,
  sameComparableRetailProduct,
} from "../src/lib/products/retailer-product-identity";
import { normaliseProductText } from "../src/lib/products/product-normalisation";

type Row = Awaited<ReturnType<typeof loadProducts>>[number];

function barcode(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

function effectiveBrand(p: Row) {
  return p.brand ?? p.storeProducts.find(s => s.brand)?.brand ?? null;
}

function effectivePack(p: Row) {
  return comparablePackSize(p.packSize)
    ?? comparablePackSize(p.name)
    ?? comparablePackSize(p.canonicalName)
    ?? p.storeProducts
      .map(s => comparablePackSize(s.packSize) ?? comparablePackSize(s.retailerProductName))
      .find(Boolean)
    ?? null;
}

function identityText(p: Row) {
  return normaliseProductText([
    p.brand,
    p.name,
    p.canonicalName,
    ...p.storeProducts.flatMap(s => [s.brand, s.retailerProductName]),
  ].filter(Boolean).join(" "));
}

const noise = new Set([
  "soft", "drink", "drinks", "bottle", "bottles", "can", "cans",
  "pack", "packs", "pk", "each", "ea",
  "coles", "woolworths", "aldi", "drakes",
  "ml", "l", "g", "kg",
]);

function distinctiveTokens(p: Row) {
  return new Set(
    identityText(p)
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

function explicitConflict(a: Row, b: Row) {
  const ab = barcode(a.barcode);
  const bb = barcode(b.barcode);
  if (ab && bb && ab !== bb) return "BARCODE_CONFLICT";

  const ap = effectivePack(a);
  const bp = effectivePack(b);
  if (ap && bp && ap !== bp) return "PACK_CONFLICT";

  const at = distinctiveTokens(a);
  const bt = distinctiveTokens(b);

  for (const token of ["vanilla", "caffeine", "diet", "max", "zero"]) {
    if (at.has(token) !== bt.has(token)) return `VARIANT_CONFLICT:${token}`;
  }

  return null;
}

function comparableInput(p: Row) {
  return {
    name: p.name,
    canonicalName: p.canonicalName,
    brand: effectiveBrand(p),
    packSize: p.packSize ?? p.storeProducts.find(s => s.packSize)?.packSize ?? null,
    barcode: p.barcode,
  };
}

function classify(a: Row, b: Row) {
  const conflict = explicitConflict(a, b);
  if (conflict) return null;

  const ab = barcode(a.barcode);
  const bb = barcode(b.barcode);
  if (ab && bb && ab === bb) return { tier: "EXACT_GTIN", score: 100 };

  if (sameComparableRetailProduct(comparableInput(a), comparableInput(b))) {
    return { tier: "STRICT_IDENTITY", score: 90 };
  }

  const ap = effectivePack(a);
  const bp = effectivePack(b);
  if (!ap || !bp || ap !== bp) return null;

  const tokensA = distinctiveTokens(a);
  const tokensB = distinctiveTokens(b);
  const tokenScore = overlap(tokensA, tokensB);

  if (tokenScore >= 0.75) {
    return {
      tier: effectiveBrand(a) && effectiveBrand(b)
        ? "STRONG_DISCOVERY"
        : "LISTING_DERIVED_IDENTITY",
      score: Math.round(tokenScore * 80),
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

  // Candidate generation by sellable pack prevents O(n²) across the catalogue.
  const byPack = new Map<string, Row[]>();
  for (const p of products) {
    const pack = effectivePack(p);
    if (!pack) continue;
    const rows = byPack.get(pack) ?? [];
    rows.push(p);
    byPack.set(pack, rows);
  }

  const edges: Array<{
    a: Row;
    b: Row;
    tier: string;
    score: number;
  }> = [];

  for (const rows of byPack.values()) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];

        // Cross-retailer duplicates are our primary target.
        const retailersA = new Set(a.storeProducts.map(s => s.retailer));
        const retailersB = new Set(b.storeProducts.map(s => s.retailer));
        if ([...retailersA].some(r => retailersB.has(r))) continue;

        const result = classify(a, b);
        if (result) edges.push({ a, b, ...result });
      }
    }
  }

  edges.sort((x, y) => y.score - x.score);

  const tierCounts = new Map<string, number>();
  for (const edge of edges) {
    tierCounts.set(edge.tier, (tierCounts.get(edge.tier) ?? 0) + 1);
  }

  console.log("============================================================");
  console.log("PACKAGED PRODUCT EQUIVALENCE AUDIT — READ ONLY");
  console.log("============================================================");
  console.log("Products scanned:", products.length);
  console.log("Pack buckets:", byPack.size);
  console.log("Candidate edges:", edges.length);
  console.log("Tier counts:", Object.fromEntries(tierCounts));

  console.log("\nTOP CANDIDATES");
  for (const edge of edges.slice(0, 150)) {
    console.log("\n------------------------------------------------------------");
    console.log(`${edge.tier} score=${edge.score}`);
    console.log({
      left: {
        id: edge.a.id,
        name: edge.a.name,
        canonicalName: edge.a.canonicalName,
        brand: effectiveBrand(edge.a),
        barcode: edge.a.barcode,
        pack: effectivePack(edge.a),
        retailers: edge.a.storeProducts.map(s => s.retailer),
        observations: edge.a._count.priceObservations,
      },
      right: {
        id: edge.b.id,
        name: edge.b.name,
        canonicalName: edge.b.canonicalName,
        brand: effectiveBrand(edge.b),
        barcode: edge.b.barcode,
        pack: effectivePack(edge.b),
        retailers: edge.b.storeProducts.map(s => s.retailer),
        observations: edge.b._count.priceObservations,
      },
    });
  }

  const pepsi600 = products.filter(p =>
    effectivePack(p) === "600ml"
    && identityText(p).includes("pepsi")
  );


  // Build connected components from candidate edges.
  const adjacency = new Map<string, Set<string>>();
  const byId = new Map(products.map(p => [p.id, p]));

  for (const edge of edges) {
    if (!adjacency.has(edge.a.id)) adjacency.set(edge.a.id, new Set());
    if (!adjacency.has(edge.b.id)) adjacency.set(edge.b.id, new Set());
    adjacency.get(edge.a.id)!.add(edge.b.id);
    adjacency.get(edge.b.id)!.add(edge.a.id);
  }

  const visited = new Set<string>();
  const groups: Row[][] = [];

  for (const id of adjacency.keys()) {
    if (visited.has(id)) continue;

    const stack = [id];
    const component: Row[] = [];
    visited.add(id);

    while (stack.length) {
      const current = stack.pop()!;
      const product = byId.get(current);
      if (product) component.push(product);

      for (const neighbour of adjacency.get(current) ?? []) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        stack.push(neighbour);
      }
    }

    if (component.length > 1) groups.push(component);
  }

  const analysedGroups = groups.map(group => {
    const gtins = [...new Set(
      group.map(p => barcode(p.barcode)).filter((x): x is string => Boolean(x))
    )];

    let pairConflict = false;
    const conflicts: string[] = [];

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const conflict = explicitConflict(group[i], group[j]);
        if (conflict) {
          pairConflict = true;
          conflicts.push(
            `${group[i].id} <> ${group[j].id}: ${conflict}`
          );
        }
      }
    }

    const retailers = [...new Set(
      group.flatMap(p => p.storeProducts.map(s => s.retailer))
    )];

    const survivor = [...group].sort((a, b) => {
      const aBarcode = barcode(a.barcode) ? 1 : 0;
      const bBarcode = barcode(b.barcode) ? 1 : 0;
      if (aBarcode !== bBarcode) return bBarcode - aBarcode;

      if (a.confidenceScore !== b.confidenceScore) {
        return b.confidenceScore - a.confidenceScore;
      }

      return a.createdAt.getTime() - b.createdAt.getTime();
    })[0];

    return {
      group,
      gtins,
      retailers,
      pairConflict,
      conflicts,
      survivor,
      observations: group.reduce(
        (sum, p) => sum + p._count.priceObservations, 0
      ),
    };
  });

  analysedGroups.sort((a, b) =>
    Number(a.pairConflict) - Number(b.pairConflict)
    || b.group.length - a.group.length
    || b.retailers.length - a.retailers.length
  );

  console.log("\n============================================================");
  console.log("CONNECTED CANDIDATE GROUPS");
  console.log("============================================================");
  console.log("Groups:", analysedGroups.length);
  console.log(
    "Conflict-free:",
    analysedGroups.filter(g => !g.pairConflict && g.gtins.length <= 1).length
  );
  console.log(
    "Quarantined:",
    analysedGroups.filter(g => g.pairConflict || g.gtins.length > 1).length
  );

  const safeGroups = analysedGroups.filter(
    g => !g.pairConflict && g.gtins.length <= 1
  );

  console.log("\nTOP CONFLICT-FREE GROUPS");

  for (const g of safeGroups.slice(0, 100)) {
    console.log("\n------------------------------------------------------------");
    console.log({
      members: g.group.length,
      retailers: g.retailers,
      gtins: g.gtins,
      observations: g.observations,
      suggestedSurvivor: g.survivor.id,
    });

    for (const p of g.group) {
      console.log({
        id: p.id,
        name: p.name,
        canonicalName: p.canonicalName,
        brand: effectiveBrand(p),
        barcode: p.barcode,
        pack: effectivePack(p),
        retailers: p.storeProducts.map(s => s.retailer),
        observations: p._count.priceObservations,
      });
    }
  }

  console.log("\nQUARANTINED GROUPS");
  for (const g of analysedGroups.filter(
    g => g.pairConflict || g.gtins.length > 1
  ).slice(0, 100)) {
    console.log("\n------------------------------------------------------------");
    console.log({
      members: g.group.length,
      retailers: g.retailers,
      gtins: g.gtins,
      conflicts: g.conflicts,
    });
  }

  console.log("\n============================================================");
  console.log("PEPSI 600mL CANARY");
  console.log("============================================================");

  for (let i = 0; i < pepsi600.length; i++) {
    for (let j = i + 1; j < pepsi600.length; j++) {
      const a = pepsi600[i];
      const b = pepsi600[j];
      console.log({
        left: `${a.id} :: ${a.name}`,
        right: `${b.id} :: ${b.name}`,
        result: classify(a, b),
        conflict: explicitConflict(a, b),
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
