import type {
  SupermarketRetailer,
  SupermarketShoppingItem,
} from "./supermarket-comparison.types";
import type { SearchLocationSource } from "../current-location";

export type GroceryPriceMatchKind = "exact" | "substitute";

export type GroceryPriceProvider =
  | "Food Price Engine"
  | "Open Prices"
  | "Coles and Woolworths"
  | "SerpApi"
  | "SerpApi Google Shopping"
  | "Food Price Engine + Open Prices + SerpApi"
  | `${string} + ${string}`;

export type LiveGroceryPriceMatch = {
  retailer: SupermarketRetailer;
  productName: string;
  price: number;
  estimatedTotal: number;
  packSize: string | null;
  unitPrice: number | null;
  unitLabel: string | null;
  isSpecial: boolean;
  matchKind: GroceryPriceMatchKind;
  matchReason: string;
  sourceUrl: string | null;
  cached: boolean;
  /** False when this is a public catalogue price rather than a selected-store result. */
  storeSpecific: boolean;
};

export type LiveGroceryPriceItemResult = {
  item: SupermarketShoppingItem;
  query: string;
  matches: LiveGroceryPriceMatch[];
  best: LiveGroceryPriceMatch | null;
  error: string | null;
};

export type LiveGroceryRetailerTotal = {
  retailer: SupermarketRetailer;
  total: number;
  matchedCount: number;
  missingCount: number;
};

export type LiveGroceryPriceSearchResponse = {
  status: "success";
  provider: GroceryPriceProvider;
  listId: string;
  listName: string;
  location: string;
  locationSource: SearchLocationSource;
  allowSubstitutes: boolean;
  searchedAt: string;
  items: LiveGroceryPriceItemResult[];
  retailerTotals: LiveGroceryRetailerTotal[];
  splitTotal: number;
  splitMatchedCount: number;
  cachedItemCount: number;
  liveItemCount: number;
  warning: string | null;
};

export type LiveGroceryPriceErrorResponse = {
  status: "error";
  error: string;
};
