export const supermarketRetailers = [
  "Woolworths",
  "Coles",
  "ALDI",
  "IGA",
  "Drakes",
  "Costco",
] as const;

export type SupermarketRetailer = (typeof supermarketRetailers)[number];

export type SupermarketPriceView = {
  id: string;
  retailer: SupermarketRetailer;
  productName: string;
  brand: string | null;
  packSize: string | null;
  price: number;
  unitPrice: number | null;
  isSpecial: boolean;
  checkedAt: string;
};

export type SupermarketShoppingItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
};

export type SupermarketShoppingList = {
  id: string;
  name: string;
  items: SupermarketShoppingItem[];
};

export type SupermarketComparisonData = {
  retailers: SupermarketRetailer[];
  prices: SupermarketPriceView[];
  shoppingLists: SupermarketShoppingList[];
  priceCount: number;
  productCount: number;
  latestCheckedAt: string | null;
};

export type SupermarketPriceActionState = {
  status: "idle" | "success" | "error";
  message: string;
  importedCount?: number;
  fieldErrors?: Record<string, string>;
};

export const initialSupermarketPriceActionState: SupermarketPriceActionState = {
  status: "idle",
  message: "",
};
