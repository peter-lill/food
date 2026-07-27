export interface ParsedReceiptItem {
  id: string;
  name: string;
  quantity: string;
  price: string;
  confidence: number;
}

export interface ParsedReceipt {
  retailer: string;
  purchasedAt: string;
  total: string;
  confidence: number;
  items: ParsedReceiptItem[];
}
