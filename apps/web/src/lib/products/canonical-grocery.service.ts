import { Prisma, type Product, type FoodKnowledge } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatProductName } from "./product-formatter";
import { shoppingIdentity } from "./food-item-intelligence";

export type CanonicalGroceryResolution = {
  canonicalName: string;
  identity: string;
  foodKnowledge: FoodKnowledge;
};

type GroceryClient = Prisma.TransactionClient | typeof prisma;

const canonicalOverrides = new Map<string, string>([
  ["beef mince lean", "beef mince"],
  ["beef mince extra lean", "beef mince"],
  ["lean beef mince", "beef mince"],
  ["extra lean beef mince", "beef mince"],
  ["very lean beef mince", "beef mince"],
  ["regular beef mince", "beef mince"],
  ["small banana", "banana"],
  ["medium banana", "banana"],
  ["large banana", "banana"],
  ["small tomato", "tomato"],
  ["medium tomato", "tomato"],
  ["large tomato", "tomato"],
]);

export function canonicalGroceryIdentity(value: string) {
  const resolved = shoppingIdentity(value).trim();
  return canonicalOverrides.get(resolved) ?? resolved;
}

export function canonicalGroceryName(value: string) {
  const identity = canonicalGroceryIdentity(value);
  return formatProductName(identity || value.trim());
}

export async function resolveCanonicalGrocery(
  value: string,
  client: GroceryClient = prisma,
): Promise<CanonicalGroceryResolution> {
  const identity = canonicalGroceryIdentity(value);
  const canonicalName = canonicalGroceryName(value);

  if (!identity || canonicalName.length < 2) {
    throw new Error(`Unable to resolve canonical grocery identity for ${JSON.stringify(value)}.`);
  }

  let foodKnowledge = await client.foodKnowledge.findFirst({
    where: { commonName: { equals: canonicalName, mode: "insensitive" } },
  });

  if (!foodKnowledge) {
    try {
      foodKnowledge = await client.foodKnowledge.create({
        data: { commonName: canonicalName },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      foodKnowledge = await client.foodKnowledge.findFirstOrThrow({
        where: { commonName: { equals: canonicalName, mode: "insensitive" } },
      });
    }
  }

  return { canonicalName, identity, foodKnowledge };
}

export async function resolveCanonicalProduct(
  value: string,
  client: GroceryClient = prisma,
): Promise<Product> {
  const resolution = await resolveCanonicalGrocery(value, client);

  const existing = await client.product.findFirst({
    where: {
      OR: [
        { canonicalName: { equals: resolution.canonicalName, mode: "insensitive" } },
        { name: { equals: resolution.canonicalName, mode: "insensitive" } },
      ],
    },
    orderBy: [
      { foodKnowledgeId: "desc" },
      { updatedAt: "desc" },
    ],
  });

  if (existing) {
    if (
      existing.canonicalName !== resolution.canonicalName
      || existing.foodKnowledgeId !== resolution.foodKnowledge.id
    ) {
      return client.product.update({
        where: { id: existing.id },
        data: {
          canonicalName: resolution.canonicalName,
          foodKnowledgeId: resolution.foodKnowledge.id,
        },
      });
    }
    return existing;
  }

  return client.product.create({
    data: {
      name: resolution.canonicalName,
      canonicalName: resolution.canonicalName,
      foodKnowledgeId: resolution.foodKnowledge.id,
      lifecycle: "MATCHED",
      confidenceScore: 1,
    },
  });
}
