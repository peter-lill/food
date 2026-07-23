"use client";

import dynamic from "next/dynamic";

const FoodDashboard = dynamic(
  () => import("./FoodDashboard").then((module) => module.FoodDashboard),
  {
    ssr: false,
    loading: () => (
      <section className="card pantry-empty" aria-live="polite">
        <strong>Loading your planner…</strong>
        <p>Restoring meal, shopping, preparation and hydration progress from this device.</p>
      </section>
    ),
  },
);

export function PlannerClient() {
  return <FoodDashboard firstName="Peter" />;
}
