export type ReceiptRetailer = "coles" | "woolworths" | "aldi" | "iga" | "drakes" | "costco" | "generic";

export type ParsedReceiptItem = {
  description: string;
  quantity: number;
  price: number | null;
  sourceText: string;
  confidence: number;
};

export type ParsedReceipt = {
  retailer: string | null;
  retailerKey: ReceiptRetailer;
  purchasedAt: string | null;
  total: number | null;
  items: ParsedReceiptItem[];
  warnings: string[];
  confidence: number;
};

export type RetailerProfile = {
  key: ReceiptRetailer;
  displayName: string;
  retailerMarkers: RegExp[];
  itemStartMarkers: RegExp[];
  itemEndMarkers: RegExp[];
  paymentMarkers: RegExp[];
  ignoredMarkers: RegExp[];
};
