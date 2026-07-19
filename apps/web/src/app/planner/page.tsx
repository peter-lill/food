import { FoodDashboard } from "./FoodDashboard";

export const metadata = {
  title: "Food Meal Planner",
  description: "Weekly meal plan, shopping checklist and meal-prep companion.",
};

export default function PlannerPage() {
  return <FoodDashboard firstName="Peter" />;
}
