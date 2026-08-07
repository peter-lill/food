CREATE TABLE "WeeklyMealPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WeeklyMealPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyMealPlanEntry" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "recipeKey" TEXT NOT NULL,
    "servings" INTEGER NOT NULL,
    CONSTRAINT "WeeklyMealPlanEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyMealPlan_userId_weekStart_key" ON "WeeklyMealPlan"("userId", "weekStart");
CREATE INDEX "WeeklyMealPlan_weekStart_idx" ON "WeeklyMealPlan"("weekStart");
CREATE UNIQUE INDEX "WeeklyMealPlanEntry_mealPlanId_day_key" ON "WeeklyMealPlanEntry"("mealPlanId", "day");
CREATE INDEX "WeeklyMealPlanEntry_recipeKey_idx" ON "WeeklyMealPlanEntry"("recipeKey");

ALTER TABLE "WeeklyMealPlan" ADD CONSTRAINT "WeeklyMealPlan_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyMealPlanEntry" ADD CONSTRAINT "WeeklyMealPlanEntry_mealPlanId_fkey"
FOREIGN KEY ("mealPlanId") REFERENCES "WeeklyMealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
