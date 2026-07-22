import type { HealthMetricType as PrismaHealthMetricType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  HealthMetricType,
  HealthSyncPayload,
  LatestHealthSummary,
} from "./health.types";

const fieldByType: Record<HealthMetricType, keyof HealthSyncPayload> = {
  HYDRATION_ML: "hydrationMl",
  STEPS: "steps",
  ACTIVE_CALORIES: "activeCaloriesKcal",
  TOTAL_CALORIES: "totalCaloriesKcal",
  EXERCISE_MINUTES: "exerciseMinutes",
  DISTANCE_METRES: "distanceMetres",
  SLEEP_MINUTES: "sleepMinutes",
  WEIGHT_KG: "weightKg",
};

export async function saveHealthSummary(payload: HealthSyncPayload) {
  const recordedAt = new Date(payload.refreshedAt);
  const source = payload.source ?? "android-health-connect";

  const rows = Object.entries(fieldByType).flatMap(([type, field]) => {
    const value = payload[field];
    return typeof value === "number"
      ? [
          {
            type: type as PrismaHealthMetricType,
            value,
            recordedAt,
            source,
          },
        ]
      : [];
  });

  await prisma.$transaction([
    prisma.healthMetric.deleteMany({
      where: { recordedAt, source },
    }),
    prisma.healthMetric.createMany({ data: rows }),
  ]);

  return { recordedAt, count: rows.length };
}

export async function getLatestHealthSummary(): Promise<LatestHealthSummary | null> {
  const latest = await prisma.healthMetric.findFirst({
    orderBy: { recordedAt: "desc" },
    select: { recordedAt: true, source: true, createdAt: true },
  });

  if (!latest) return null;

  const rows = await prisma.healthMetric.findMany({
    where: {
      recordedAt: latest.recordedAt,
      source: latest.source,
    },
  });

  const values = new Map(rows.map((row) => [row.type, row.value]));
  const numberValue = (type: HealthMetricType) => values.get(type) ?? 0;

  return {
    date: latest.recordedAt.toISOString().slice(0, 10),
    hydrationMl: numberValue("HYDRATION_ML"),
    steps: numberValue("STEPS"),
    activeCaloriesKcal: numberValue("ACTIVE_CALORIES"),
    totalCaloriesKcal: numberValue("TOTAL_CALORIES"),
    distanceMetres: numberValue("DISTANCE_METRES"),
    exerciseMinutes: numberValue("EXERCISE_MINUTES"),
    sleepMinutes: numberValue("SLEEP_MINUTES"),
    weightKg: values.get("WEIGHT_KG") ?? null,
    refreshedAt: latest.recordedAt.toISOString(),
    syncedAt: latest.createdAt.toISOString(),
    source: latest.source ?? "android-health-connect",
  };
}
