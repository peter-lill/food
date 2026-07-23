export type ShoppingActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
};

export const initialShoppingActionState: ShoppingActionState = {
  status: "idle",
  message: "",
};

export type ShoppingItemView = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  category: string;
};

export type ShoppingListView = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  totalCount: number;
  completedCount: number;
  items: ShoppingItemView[];
};

export type PantryShoppingSuggestion = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  location: "PANTRY" | "FRIDGE" | "FREEZER";
};

export type ShoppingWorkspaceData = {
  lists: ShoppingListView[];
  pantrySuggestions: PantryShoppingSuggestion[];
};
