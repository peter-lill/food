ALTER TABLE "WeeklyMealPlanEntry"
ADD COLUMN "slot" TEXT NOT NULL DEFAULT 'dinner';

DROP INDEX "WeeklyMealPlanEntry_mealPlanId_day_key";

CREATE UNIQUE INDEX "WeeklyMealPlanEntry_mealPlanId_day_slot_key"
ON "WeeklyMealPlanEntry"("mealPlanId", "day", "slot");

CREATE INDEX "WeeklyMealPlanEntry_mealPlanId_day_idx"
ON "WeeklyMealPlanEntry"("mealPlanId", "day");
