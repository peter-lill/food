import type { ParsedReceipt } from "./types";

export function parseReceipt(_: string): ParsedReceipt {
  return {
    retailer: "",
    purchasedAt: "",
    total: "",
    confidence: 0,
    items: []
  };
}
