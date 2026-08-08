import type { PlannerDayPlan, PlannerMealSelection } from "./planner.types";

export const plannerMealSlots = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snacks", label: "Snacks" },
] as const;

export type PlannerMealSlot = (typeof plannerMealSlots)[number]["key"];

const plannerMealSlotKeys = new Set<string>(plannerMealSlots.map((slot) => slot.key));

export function isPlannerMealSlot(value: string): value is PlannerMealSlot {
  return plannerMealSlotKeys.has(value);
}

export function withPlannerMealSelection(
  plan: Record<string, PlannerDayPlan>,
  dayKey: string,
  slot: PlannerMealSlot,
  selection: PlannerMealSelection | null,
) {
  const next = { ...plan };
  const dayPlan = { ...(next[dayKey] ?? {}) };

  if (selection) dayPlan[slot] = selection;
  else delete dayPlan[slot];

  if (Object.keys(dayPlan).length > 0) next[dayKey] = dayPlan;
  else delete next[dayKey];

  return next;
}
