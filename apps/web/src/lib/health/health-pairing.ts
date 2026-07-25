import { prisma } from "@/lib/prisma";

export async function isHealthConnectPaired(userId: string) {
  const devices = await prisma.verification.findMany({
    where: {
      identifier: { startsWith: "health-connect-device:" },
      expiresAt: { gt: new Date() },
    },
    select: { value: true },
  });

  return devices.some((device) => {
    try {
      const value = JSON.parse(device.value) as { userId?: unknown };
      return value.userId === userId;
    } catch {
      return false;
    }
  });
}
