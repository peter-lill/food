export type GroceryProviderRetailer = "Coles" | "Woolworths" | "Costco" | "ALDI" | "IGA" | "Drakes";

export type GroceryProviderResult = {
  retailer: GroceryProviderRetailer;
  name: string;
  price: number | null;
  unit: string | null;
  store: string | null;
  barcode: string | null;
  imageUrl: string | null;
  productId: string | null;
  wasPrice: number | null;
  isSpecial: boolean;
  promotion: string | null;
  source: string;
};

export type GroceryProviderSearchOptions = {
  limit?: number;
  storeId?: string | null;
  retailers?: Array<"Coles" | "Woolworths">;
  storeIds?: Partial<Record<"Coles" | "Woolworths", string>>;
};

export interface GroceryProvider {
  id: string;
  enabled(): boolean;
  search(query: string, options?: GroceryProviderSearchOptions): Promise<GroceryProviderResult[]>;
}
