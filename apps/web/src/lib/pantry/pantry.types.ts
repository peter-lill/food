import type { ProductCatalogueItem } from "@/lib/products/product-catalogue.types";

export const pantryLocations = ["PANTRY", "FRIDGE", "FREEZER"] as const;

export type PantryLocation = (typeof pantryLocations)[number];

export type PantryItem = {
  id: string;
  name: string;
  barcode: string | null;
  location: PantryLocation;
  quantity: number;
  unit: string;
  expiresAt: string | null;
  purchasedAt: string | null;
  useSoon: boolean;
  expired: boolean;
};

export type PantryActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
};

export type PantryPageData = {
  items: PantryItem[];
  products: ProductCatalogueItem[];
};

export const initialPantryActionState: PantryActionState = {
  status: "idle",
  message: "",
};
