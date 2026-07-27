import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveCanonicalProduct } from "../src/lib/products/product-intelligence";

const influxUrl = (process.env.AUSCOST_INFLUX_URL ?? "http://localhost:8086").replace(/\/$/, "");
const influxToken = process.env.AUSCOST_INFLUX_TOKEN?.trim();
const influxOrg = process.env.AUSCOST_INFLUX_ORG?.trim() || "groceries";
const influxBucket = process.env.AUSCOST_INFLUX_BUCKET?.trim() || "groceries";
const lookbackHours = Math.max(1, Number(process.env.AUSCOST_IMPORT_LOOKBACK_HOURS ?? "48"));

if (!influxToken) {
  throw new Error("AUSCOST_INFLUX_TOKEN is required.");
}

type CsvRow = Record<string, string>;

type ImportedObservation = {
  observedAt: Date;
  externalId: string;
  productName: string;
  retailer: string;
  location: string | null;
  department: string | null;
  price: number;
  weightGrams: number | null;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value);
  return values;
}

function parseInfluxCsv(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
  if (lines.length < 2) return [];

  const rows: CsvRow[] = [];
  let headers: string[] | null = null;

  for (const line of lines) {
    const values = parseCsvLine(line);
    if (!headers || values.includes("_time")) {
      headers = values;
      continue;
    }

    if (values.length !== headers.length) continue;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  }

  return rows;
}

function clean(value: string | undefined) {
  const result = value?.replace(/\s+/g, " ").trim();
  return result || null;
}

function normaliseRetailer(value: string) {
  const retailer = value.trim().toLocaleLowerCase("en-AU");
  if (retailer.includes("woolworths")) return "Woolworths";
  if (retailer.includes("coles")) return "Coles";
  return value.trim();
}

function observationFromRow(row: CsvRow): ImportedObservation | null {
  const productName = clean(row.name);
  const externalId = clean(row.id);
  const store = clean(row.store);
  const observedAt = new Date(row._time ?? "");
  const cents = Number(row.cents);
  const grams = Number(row.grams);

  if (!productName || !externalId || !store || Number.isNaN(observedAt.getTime()) || !Number.isFinite(cents) || cents <= 0) {
    return null;
  }

  return {
    observedAt,
    externalId,
    productName,
    retailer: normaliseRetailer(store),
    location: clean(row.location),
    department: clean(row.department),
    price: cents / 100,
    weightGrams: Number.isFinite(grams) && grams > 0 ? grams : null,
  };
}

async function fetchObservations() {
  const flux = `from(bucket: ${JSON.stringify(influxBucket)})
  |> range(start: -${lookbackHours}h)
  |> filter(fn: (r) => r._measurement == "product")
  |> filter(fn: (r) => r._field == "cents" or r._field == "grams")
  |> pivot(rowKey: ["_time", "id", "store"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "name", "store", "location", "department", "id", "cents", "grams"])
  |> sort(columns: ["_time"])`;

  const response = await fetch(`${influxUrl}/api/v2/query?org=${encodeURIComponent(influxOrg)}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${influxToken}`,
      Accept: "application/csv",
      "Content-Type": "application/vnd.flux",
    },
    body: flux,
  });

  if (!response.ok) {
    throw new Error(`Auscost InfluxDB query returned HTTP ${response.status}: ${await response.text()}`);
  }

  return parseInfluxCsv(await response.text())
    .map(observationFromRow)
    .filter((value): value is ImportedObservation => value !== null);
}

async function importObservation(observation: ImportedObservation) {
  const { product } = await resolveCanonicalProduct({
    name: observation.productName,
    source: "price",
    category: observation.department,
  });

  const packSize = observation.weightGrams ? `${observation.weightGrams} g` : null;
  const storeProduct = await prisma.storeProduct.upsert({
    where: {
      retailer_externalId: {
        retailer: observation.retailer,
        externalId: observation.externalId,
      },
    },
    update: {
      productId: product.id,
      retailerProductName: observation.productName,
      packSize,
      packQuantity: observation.weightGrams,
      packUnit: observation.weightGrams ? "g" : null,
      aisle: observation.department,
      active: true,
      lastSeenAt: observation.observedAt,
    },
    create: {
      productId: product.id,
      retailer: observation.retailer,
      externalId: observation.externalId,
      retailerProductName: observation.productName,
      packSize,
      packQuantity: observation.weightGrams,
      packUnit: observation.weightGrams ? "g" : null,
      aisle: observation.department,
      active: true,
      lastSeenAt: observation.observedAt,
    },
  });

  const duplicate = await prisma.priceObservation.findFirst({
    where: {
      storeProductId: storeProduct.id,
      observedAt: observation.observedAt,
      source: "auscost",
    },
    select: { id: true },
  });

  if (duplicate) return false;

  await prisma.priceObservation.create({
    data: {
      productId: product.id,
      storeProductId: storeProduct.id,
      retailer: observation.retailer,
      price: observation.price,
      unitPrice: observation.weightGrams ? observation.price / (observation.weightGrams / 100) : null,
      unitLabel: observation.weightGrams ? "per 100 g" : null,
      source: "auscost",
      sourceUrl: observation.location,
      observedAt: observation.observedAt,
    },
  });

  return true;
}

async function main() {
  const observations = await fetchObservations();
  let imported = 0;
  let skipped = 0;

  for (const observation of observations) {
    try {
      if (await importObservation(observation)) imported += 1;
      else skipped += 1;
    } catch (error) {
      skipped += 1;
      console.error("Unable to import Auscost observation", {
        retailer: observation.retailer,
        externalId: observation.externalId,
        productName: observation.productName,
        error,
      });
    }
  }

  console.log(`Auscost import complete: ${imported} new observations, ${skipped} skipped, ${observations.length} read.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
