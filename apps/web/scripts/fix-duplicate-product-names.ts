import "dotenv/config";
import { prisma } from "../src/lib/prisma";

function normalise(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseRepeatedPhrase(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return value.trim();

  for (let size = 1; size <= Math.floor(words.length / 2); size += 1) {
    if (words.length % size !== 0) continue;
    const phrase = words.slice(0, size).join(" ");
    const repeated = Array.from({ length: words.length / size }, () => phrase).join(" ");
    if (normalise(repeated) === normalise(value)) return phrase;
  }

  return value.trim();
}

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, canonicalName: true },
  });

  let updated = 0;

  for (const product of products) {
    const cleanName = collapseRepeatedPhrase(product.name);
    const cleanCanonical = product.canonicalName
      ? collapseRepeatedPhrase(product.canonicalName)
      : null;

    const canonicalName = cleanCanonical && normalise(cleanCanonical) !== normalise(cleanName)
      ? cleanCanonical
      : null;

    if (cleanName === product.name && canonicalName === product.canonicalName) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        name: cleanName,
        canonicalName,
      },
    });
    updated += 1;
  }

  console.log(`Cleaned duplicate identity text on ${updated} product record(s).`);
}

main()
  .catch((error) => {
    console.error("Duplicate product identity cleanup failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
