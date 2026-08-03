import { promises as fs } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), ".next");
const forbidden = [
  "initialPairingActionState",
  "generateHealthConnectPairingCode",
  "health-connect-pairing.actions",
];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

let files;
try {
  files = await walk(root);
} catch (error) {
  console.error("Unable to inspect the production bundle.", error);
  process.exit(1);
}

const matches = [];
for (const file of files) {
  const content = await fs.readFile(file, "utf8");
  const found = forbidden.filter((symbol) => content.includes(symbol));
  if (found.length > 0) matches.push({ file: path.relative(process.cwd(), file), found });
}

if (matches.length > 0) {
  console.error("Production bundle contains removed Health Connect server-action code:");
  for (const match of matches) {
    console.error(`- ${match.file}: ${match.found.join(", ")}`);
  }
  process.exit(1);
}

console.log("Verified production bundle: no removed Health Connect server-action code found.");
