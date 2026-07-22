export const healthMetricTypes = [
  "HYDRATION_ML",
  "STEPS",
  "ACTIVE_CALORIES",
  "TOTAL_CALORIES",
  "EXERCISE_MINUTES",
  "DISTANCE_METRES",
  "SLEEP_MINUTES",
  "WEIGHT_KG",
] as const;

export type HealthMetricType = (typeof healthMetricTypes)[number];

export interface HealthSyncPayload {
  date: string;
  hydrationMl: number;
  steps: number;
  activeCaloriesKcal: number;
  totalCaloriesKcal: number;
  distanceMetres: number;
  exerciseMinutes: number;
  sleepMinutes: number;
  weightKg: number | null;
  refreshedAt: string;
  source?: string;
}

export interface LatestHealthSummary extends HealthSyncPayload {
  syncedAt: string;
}
