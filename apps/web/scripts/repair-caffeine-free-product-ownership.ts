import "dotenv/config";

import { prisma } from "../src/lib/prisma";

const CONFIRM = "I_UNDERSTAND_THIS_WRITES";
const MIXED_PRODUCT_ID = "55afeb81-b2cb-465a-bacd-9ef24c503f86";
const PEPSI_PRODUCT_ID = "1b802c73-b50c-40ed-8811-0aa45d07d115";
const PEPSI_STORE_PRODUCT_IDS = [
  "7de8781b-d56e-4464-b27b-4f57ad0d7265",
  "e7a92a12-0747-4a5a-8484-c9c797fbb417",
];
const COCA_COLA_STORE_PRODUCT_ID = "cab29f06-03ea-48b4-81ac-1ce9ac3055f1";
const COCA_COLA_CANONICAL_NAME = "Coca Cola Zero Sugar Zero Caffeine Soft Drink";

const apply = process.argv.includes("--apply");
const confirm = process.argv.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length);

async function loadState(client: typeof prisma) {
  const [mixed, pepsi, stores] = await Promise.all([
    client.product.findUnique({
      where: { id: MIXED_PRODUCT_ID },
      select: { id: true, name: true, canonicalName: true, brand: true, barcode: true, packSize: true },
    }),
    client.product.findUnique({
      where: { id: PEPSI_PRODUCT_ID },
      select: { id: true, name: true, canonicalName: true, brand: true, barcode: true, packSize: true },
    }),
    client.storeProduct.findMany({
      where: { id: { in: [...PEPSI_STORE_PRODUCT_IDS, COCA_COLA_STORE_PRODUCT_ID] } },
      select: { id: true, productId: true, retailer: true, externalId: true, retailerProductName: true, brand: true, packSize: true },
    }),
  ]);

  const observations = await client.priceObservation.groupBy({
    by: ["storeProductId", "productId"],
    where: { storeProductId: { in: [...PEPSI_STORE_PRODUCT_IDS, COCA_COLA_STORE_PRODUCT_ID] } },
    _count: { _all: true },
  });

  return { mixed, pepsi, stores, observations };
}

function assertExpectedState(state: Awaited<ReturnType<typeof loadState>>) {
  if (!state.mixed || !state.pepsi) throw new Error("Expected Products are missing");
  if (state.mixed.packSize !== "1.25L" || state.pepsi.packSize !== "1.25L") throw new Error("Unexpected Product pack size");
  if (state.pepsi.brand !== "Pepsi" || state.pepsi.barcode !== "9313820003504") throw new Error("Pepsi target identity drifted");

  const byId = new Map(state.stores.map((row) => [row.id, row]));
  for (const id of PEPSI_STORE_PRODUCT_IDS) {
    const row = byId.get(id);
    if (!row || row.productId !== MIXED_PRODUCT_ID || !row.retailerProductName.toLowerCase().includes("pepsi")) {
      throw new Error(`Pepsi StoreProduct ${id} no longer matches expected mixed ownership`);
    }
  }
  const coke = byId.get(COCA_COLA_STORE_PRODUCT_ID);
  if (!coke || coke.productId !== MIXED_PRODUCT_ID || coke.brand !== "Coca-Cola") {
    throw new Error("Coca-Cola StoreProduct no longer matches expected ownership");
  }
}

async function main() {
  if (apply && confirm !== CONFIRM) throw new Error(`Writes require --apply --confirm=${CONFIRM}`);

  const before = await loadState(prisma);
  assertExpectedState(before);

  const pepsiObservationCount = before.observations
    .filter((row) => row.storeProductId && PEPSI_STORE_PRODUCT_IDS.includes(row.storeProductId))
    .reduce((sum, row) => sum + row._count._all, 0);
  const cokeObservationCount = before.observations
    .filter((row) => row.storeProductId === COCA_COLA_STORE_PRODUCT_ID)
    .reduce((sum, row) => sum + row._count._all, 0);

  const summary = {
    mode: apply ? "apply" : "dry-run",
    writesPerformed: false,
    pepsiStoreProductsToMove: PEPSI_STORE_PRODUCT_IDS.length,
    pepsiObservationsToOwn: pepsiObservationCount,
    cocaColaStoreProductsRetained: 1,
    cocaColaObservationsRetained: cokeObservationCount,
    mixedProductCanonicalNameBefore: before.mixed!.canonicalName,
    mixedProductCanonicalNameAfter: COCA_COLA_CANONICAL_NAME,
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    const storeMove = await tx.storeProduct.updateMany({
      where: { id: { in: PEPSI_STORE_PRODUCT_IDS }, productId: MIXED_PRODUCT_ID },
      data: { productId: PEPSI_PRODUCT_ID },
    });
    if (storeMove.count !== 2) throw new Error(`Expected 2 Pepsi StoreProducts to move, moved ${storeMove.count}`);

    const observationMove = await tx.priceObservation.updateMany({
      where: { storeProductId: { in: PEPSI_STORE_PRODUCT_IDS } },
      data: { productId: PEPSI_PRODUCT_ID },
    });
    if (observationMove.count !== pepsiObservationCount) {
      throw new Error(`Expected ${pepsiObservationCount} Pepsi observations, updated ${observationMove.count}`);
    }

    const metadata = await tx.product.updateMany({
      where: {
        id: MIXED_PRODUCT_ID,
        canonicalName: before.mixed!.canonicalName,
      },
      data: { canonicalName: COCA_COLA_CANONICAL_NAME },
    });
    if (metadata.count !== 1) throw new Error("Mixed Product metadata drifted before repair");

    const after = await loadState(tx as unknown as typeof prisma);
    const byId = new Map(after.stores.map((row) => [row.id, row]));
    for (const id of PEPSI_STORE_PRODUCT_IDS) {
      if (byId.get(id)?.productId !== PEPSI_PRODUCT_ID) throw new Error(`Post-repair Pepsi ownership failed for ${id}`);
    }
    if (byId.get(COCA_COLA_STORE_PRODUCT_ID)?.productId !== MIXED_PRODUCT_ID) throw new Error("Post-repair Coca-Cola ownership failed");

    for (const row of after.observations) {
      if (!row.storeProductId) continue;
      const owner = byId.get(row.storeProductId)?.productId;
      if (!owner || row.productId !== owner) throw new Error(`Post-repair observation ownership failed for ${row.storeProductId}`);
    }
    if (after.mixed?.canonicalName !== COCA_COLA_CANONICAL_NAME) throw new Error("Post-repair Coca-Cola canonical name failed");
  }, { timeout: 60_000 });

  console.log(JSON.stringify({ ...summary, writesPerformed: true }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
