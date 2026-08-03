import { prisma } from "../src/lib/prisma";
import { normaliseProductText, parseProductName } from "../src/lib/products/product-normalisation";

type Issue = {
  severity: "high" | "medium" | "low";
  code: string;
  productId: string;
  name: string;
  canonicalName: string | null;
  detail: string;
};

const retailerPattern = /\b(coles|woolworths|aldi|costco)\b/i;
const packPattern = /\b\d+(?:\.\d+)?\s*(?:g|gram|grams|kg|ml|l)\b/i;
const receiptAbbreviationPattern = /\b(slcd|btl|pkt|pk|ea)\b/i;
const producePattern = /\b(mushroom|carrot|onion|potato|sweet potato|capsicum|tomato|zucchini|broccoli|cauliflower|garlic|ginger|lemon|lime|apple|banana|avocado)\b/i;
const suspiciousImagePattern = /\b(pie|recipe|meal|dish|serving|banner|logo|placeholder)\b/i;

function add(issues: Issue[], issue: Issue) {
  issues.push(issue);
}

async function main() {
  const products = await prisma.product.findMany({
    include: {
      aliases: true,
      storeProducts: { select: { retailerProductName: true, imageUrl: true } },
      _count: {
        select: {
          inventoryItems: true,
          receiptItems: true,
          ingredientRecords: true,
          shoppingItems: true,
          priceObservations: true,
        },
      },
    },
    orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
  });

  const issues: Issue[] = [];
  const identities = new Map<string, typeof products>();

  for (const product of products) {
    const parsedRaw = parseProductName(product.name);
    const parsedCanonical = parseProductName(product.canonicalName ?? product.name);
    const identityKey = parsedRaw.canonicalKey;
    const group = identities.get(identityKey) ?? [];
    group.push(product);
    identities.set(identityKey, group);

    if (parsedRaw.canonicalKey !== parsedCanonical.canonicalKey) {
      add(issues, {
        severity: "high",
        code: "RAW_CANONICAL_CONFLICT",
        productId: product.id,
        name: product.name,
        canonicalName: product.canonicalName,
        detail: `Raw name resolves to “${parsedRaw.canonicalName}” but canonical name resolves to “${parsedCanonical.canonicalName}”.`,
      });
    }

    if (retailerPattern.test(product.name)) {
      add(issues, {
        severity: "medium",
        code: "RETAILER_IN_PRODUCT_NAME",
        productId: product.id,
        name: product.name,
        canonicalName: product.canonicalName,
        detail: "Retailer text should normally be retained as an alias or store listing, not the canonical product name.",
      });
    }

    if (packPattern.test(product.name)) {
      add(issues, {
        severity: "medium",
        code: "PACK_SIZE_IN_PRODUCT_NAME",
        productId: product.id,
        name: product.name,
        canonicalName: product.canonicalName,
        detail: "Pack size should be stored in pack fields rather than the canonical name.",
      });
    }

    if (receiptAbbreviationPattern.test(product.name)) {
      add(issues, {
        severity: "medium",
        code: "RECEIPT_ABBREVIATION",
        productId: product.id,
        name: product.name,
        canonicalName: product.canonicalName,
        detail: "Receipt abbreviation remains in the product name.",
      });
    }

    if (producePattern.test(product.name) && !product.category) {
      add(issues, {
        severity: "low",
        code: "UNCATEGORISED_PRODUCE",
        productId: product.id,
        name: product.name,
        canonicalName: product.canonicalName,
        detail: "Likely fresh produce has no category.",
      });
    }

    const imageEvidence = [product.imageUrl, ...product.storeProducts.map((item) => item.imageUrl)]
      .filter((value): value is string => Boolean(value))
      .join(" ");
    const listingEvidence = product.storeProducts.map((item) => item.retailerProductName).join(" ");
    if (imageEvidence && suspiciousImagePattern.test(`${imageEvidence} ${listingEvidence}`)) {
      add(issues, {
        severity: "high",
        code: "SUSPICIOUS_IMAGE_MATCH",
        productId: product.id,
        name: product.name,
        canonicalName: product.canonicalName,
        detail: "Image or retailer listing appears to reference a prepared meal, recipe, logo or placeholder rather than the product itself.",
      });
    }

    const normalisedAliases = new Set(product.aliases.map((alias) => alias.normalised));
    const rawNormalised = normaliseProductText(product.name);
    if (rawNormalised && !normalisedAliases.has(rawNormalised)) {
      add(issues, {
        severity: "low",
        code: "MISSING_RAW_ALIAS",
        productId: product.id,
        name: product.name,
        canonicalName: product.canonicalName,
        detail: "The original product name is not preserved as an alias.",
      });
    }
  }

  for (const [key, group] of identities) {
    if (group.length < 2) continue;
    for (const product of group) {
      add(issues, {
        severity: "high",
        code: "DUPLICATE_CANONICAL_IDENTITY",
        productId: product.id,
        name: product.name,
        canonicalName: product.canonicalName,
        detail: `${group.length} records resolve to canonical key “${key}”: ${group.map((item) => item.name).join(" | ")}`,
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  issues.sort((left, right) => rank[left.severity] - rank[right.severity] || left.name.localeCompare(right.name));

  console.log("Product catalogue audit");
  console.log(`Products reviewed: ${products.length}`);
  console.log(`Issues found: ${issues.length}`);
  console.log(`High: ${issues.filter((issue) => issue.severity === "high").length}`);
  console.log(`Medium: ${issues.filter((issue) => issue.severity === "medium").length}`);
  console.log(`Low: ${issues.filter((issue) => issue.severity === "low").length}`);

  for (const issue of issues) {
    console.log(`\n[${issue.severity.toUpperCase()}] ${issue.code}`);
    console.log(`  ${issue.name} (${issue.productId})`);
    if (issue.canonicalName) console.log(`  canonical: ${issue.canonicalName}`);
    console.log(`  ${issue.detail}`);
  }

  if (!issues.length) console.log("\nNo catalogue issues detected.");
  console.log("\nThis command is read-only. No database changes were made.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
