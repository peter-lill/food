import type {
  SupermarketRetailer,
  SupermarketShoppingItem,
} from "./supermarket-comparison.types";

export type GroceryPriceMatchKind = "exact" | "substitute";

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
  provider: "SerpApi Google Shopping";
  location: string;
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
