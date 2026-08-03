export type ReceiptRetailer =
  | "coles"
  | "woolworths"
  | "aldi"
  | "iga"
  | "drakes"
  | "costco"
  | "generic";

export interface ParsedReceiptItem {
  description: string;
  quantity: number;
  price: number | null;
  sourceText: string;
  confidence: number;
}

export interface ReceiptParserDiagnostics {
  normalisedLines: string[];
  itemSectionLines: string[];
  totalLine: string | null;
  paymentStartLine: string | null;
}

export interface ParsedReceipt {
  retailer: string | null;
  retailerKey: ReceiptRetailer;
  purchasedAt: string | null;
  total: number | null;
  confidence: number;
  items: ParsedReceiptItem[];
  warnings: string[];
  diagnostics: ReceiptParserDiagnostics;
}
