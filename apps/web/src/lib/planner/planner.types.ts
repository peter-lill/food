export type PlannerIngredient = {
  name: string;
  quantity: number;
  unit: string;
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
  source: "database" | "starter" | "external";
  sourceKey?: string | null;
  originalSourceName?: string | null;
  originalSourceUrl?: string | null;
};

export type PlannerPantryItem = {
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

export type PlannerWorkspaceData = {
  recipes: PlannerRecipe[];
  pantryItems: PlannerPantryItem[];
  shoppingLists: PlannerShoppingList[];
};
