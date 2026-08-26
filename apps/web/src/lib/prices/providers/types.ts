export type GroceryProviderRetailer = "Coles" | "Woolworths" | "Costco" | "ALDI" | "IGA" | "Drakes";

export type GroceryProviderResult = {
  retailer: GroceryProviderRetailer;
  name: string;
  price: number | null;
  /** Retailer-provided package or sale size, separate from price units. */
  packSize: string | null;
  unit: string | null;
  store: string | null;
  barcode: string | null;
  imageUrl: string | null;
  productId: string | null;
  wasPrice: number | null;
  isSpecial: boolean;
  promotion: string | null;
  /** Public product page supplied by the retailer, where available. */
  productUrl: string | null;
  /** Whether the observation was obtained for the user's selected store. */
  storeSpecific: boolean;
  source: string;
};

export type GroceryProviderSearchOptions = {
  limit?: number;
  storeId?: string | null;
  retailers?: Array<"Coles" | "Woolworths" | "ALDI" | "Drakes">;
  storeIds?: Partial<Record<"Coles" | "Woolworths" | "ALDI" | "Drakes", string>>;
};

export interface GroceryProvider {
  id: string;
  enabled(): boolean;
  search(query: string, options?: GroceryProviderSearchOptions): Promise<GroceryProviderResult[]>;
}
