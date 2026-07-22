import type { HealthSyncPayload } from "./health.types";

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return value;
}

export function parseHealthSyncPayload(value: unknown): HealthSyncPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Payload must be an object.");
  }

  const payload = value as Record<string, unknown>;
  const date = typeof payload.date === "string" ? payload.date : "";
  const refreshedAt =
    typeof payload.refreshedAt === "string" ? payload.refreshedAt : "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("date must use YYYY-MM-DD format.");
  }

  if (Number.isNaN(Date.parse(refreshedAt))) {
    throw new Error("refreshedAt must be an ISO date-time.");
  }

  const weightKg = payload.weightKg;
  if (weightKg !== null && weightKg !== undefined) {
    finiteNumber(weightKg, "weightKg");
  }

  return {
    date,
    hydrationMl: finiteNumber(payload.hydrationMl, "hydrationMl"),
    steps: finiteNumber(payload.steps, "steps"),
    activeCaloriesKcal: finiteNumber(
      payload.activeCaloriesKcal,
      "activeCaloriesKcal",
    ),
    totalCaloriesKcal: finiteNumber(
      payload.totalCaloriesKcal,
      "totalCaloriesKcal",
    ),
    distanceMetres: finiteNumber(payload.distanceMetres, "distanceMetres"),
    exerciseMinutes: finiteNumber(
      payload.exerciseMinutes,
      "exerciseMinutes",
    ),
    sleepMinutes: finiteNumber(payload.sleepMinutes, "sleepMinutes"),
    weightKg: typeof weightKg === "number" ? weightKg : null,
    refreshedAt: new Date(refreshedAt).toISOString(),
    source:
      typeof payload.source === "string" && payload.source.trim()
        ? payload.source.trim().slice(0, 100)
        : "android-health-connect",
  };
}
