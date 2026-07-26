import { prisma } from "@/lib/prisma";

export async function isHealthConnectPaired(userId: string) {
  const rows = await prisma.$queryRaw<Array<{ paired: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "HealthConnectDevice"
      WHERE "userId" = ${userId}
        AND "expiresAt" > NOW()
        AND "revokedAt" IS NULL
    ) AS "paired"
  `;

  return rows[0]?.paired ?? false;
}
