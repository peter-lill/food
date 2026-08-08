export type PlannerIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  productId?: string | null;
};

export type PlannerRecipe = {
  id: string;
  name: string;
  description: string | null;
  minutes: number | null;
  proteinGrams: number | null;
  servings: number;
  imageUrl: string | null;
  instructions: string[];
  ingredients: PlannerIngredient[];
  source: "database" | "starter" | "external" | "catalogue";
  sourceKey?: string | null;
  originalSourceName?: string | null;
  originalSourceUrl?: string | null;
};

export type PlannerPantryItem = {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  location: string;
};

export type PlannerShoppingList = {
  id: string;
  name: string;
  remainingCount: number;
};

export type PlannerMealSelection = {
  recipeId: string;
  servings: number;
};

export type PlannerDayPlan = Partial<Record<
  import("./planner-meals").PlannerMealSlot,
  PlannerMealSelection
>>;

export type PlannerRecipeAvailability = {
  availableCount: number;
  ingredientCount: number;
  percent: number;
};

export type PlannerDayAvailability = Partial<Record<
  import("./planner-meals").PlannerMealSlot,
  PlannerRecipeAvailability
>>;

export type PlannerWorkspaceData = {
  recipes: PlannerRecipe[];
  pantryItems: PlannerPantryItem[];
  shoppingLists: PlannerShoppingList[];
  weekStart: string;
  plan: Record<string, PlannerDayPlan>;
  dayAvailability: Record<string, PlannerDayAvailability>;
  missingIngredients: import("@/lib/recipes/recipe-pantry").IngredientAvailability[];
};
