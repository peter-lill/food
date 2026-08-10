export const plannerDays = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
] as const;

export function currentPlannerWeekStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const brisbaneDate = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
  const daysSinceMonday = (brisbaneDate.getUTCDay() + 6) % 7;
  brisbaneDate.setUTCDate(brisbaneDate.getUTCDate() - daysSinceMonday);
  return brisbaneDate;
}
