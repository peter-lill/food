export type PriceHistoryObservation = {
  id: string;
  productName: string;
  retailer: string;
  purchasedAt: string;
  linePrice: number;
  quantity: number | null;
  unit: string | null;
  comparisonPrice: number;
  comparisonLabel: string;
};

export type RetailerPriceSummary = {
  retailer: string;
  observationCount: number;
  latestPrice: number;
  lowestPrice: number;
  averagePrice: number;
  latestPurchasedAt: string;
};

export type ProductPriceHistory = {
  key: string;
  name: string;
  comparisonLabel: string;
  observationCount: number;
  latestPrice: number;
  previousPrice: number | null;
  lowestPrice: number;
  highestPrice: number;
  averagePrice: number;
  changeAmount: number | null;
  changePercent: number | null;
  latestPurchasedAt: string;
  retailers: RetailerPriceSummary[];
  observations: PriceHistoryObservation[];
};

export type PriceHistoryData = {
  products: ProductPriceHistory[];
  productCount: number;
  observationCount: number;
  retailerCount: number;
  retailers: string[];
};
