import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Store = {
  storeId: string;
  name: string;
  address: string;
  postcode: string;
  state: string;
  phone: string;
};

const expectedHeaders = ["Brand", "Name", "Number", "Address", "Store Type", "Contact"];

function parseCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function clean(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function storeFromRow(headers: string[], values: string[]): Store | null {
  const row = Object.fromEntries(headers.map((header, index) => [header, clean(values[index] ?? "")]));
  if (row.Brand.toUpperCase() !== "COLES" || row["Store Type"].toLowerCase() !== "retail") return null;
  if (!/^\d+$/.test(row.Number)) throw new Error(`Invalid Coles store number: ${row.Number || "(empty)"}`);

  const location = row.Address.match(/\b(\d{3,4})\s+(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s*$/i);
  return {
    storeId: row.Number,
    name: row.Name,
    address: row.Address,
    postcode: location?.[1].padStart(4, "0") ?? "",
    state: location?.[2].toUpperCase() ?? "",
    phone: row.Contact,
  };
}

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run retailers:coles:stores:import -- <path-to-LocationsData.csv>");

const rows = parseCsv(readFileSync(resolve(input), "utf8"));
const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) ?? [];
while (headers.at(-1) === "") headers.pop();
if (headers.length !== expectedHeaders.length || headers.some((header, index) => header !== expectedHeaders[index])) {
  throw new Error(`Unexpected CSV headers. Expected: ${expectedHeaders.join(", ")}`);
}

const stores = rows
  .map((row) => storeFromRow(headers, row))
  .filter((store): store is Store => store !== null)
  .sort((left, right) => Number(left.storeId) - Number(right.storeId));

if (stores.length < 500) throw new Error(`Only ${stores.length} retail stores were found; refusing to replace the directory.`);
const storeIds = new Set(stores.map((store) => store.storeId));
if (storeIds.size !== stores.length) throw new Error("The Coles export contains duplicate store numbers.");
if (!storeIds.has("4472")) throw new Error("The known Springwood store 4472 is missing from the export.");

const output = fileURLToPath(new URL("../src/data/coles-store-directory.generated.json", import.meta.url));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(stores)}\n`);
console.log(`Imported ${stores.length} Coles retail stores into ${output}`);
