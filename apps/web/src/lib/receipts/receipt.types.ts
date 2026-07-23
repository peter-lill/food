import type { PantryLocation } from "@/lib/pantry/pantry.types";

export const receiptStatuses = ["DRAFT", "IMPORTED", "CANCELLED"] as const;
export type ReceiptStatusValue = (typeof receiptStatuses)[number];

export type ReceiptActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialReceiptActionState: ReceiptActionState = { status: "idle" };

export type ReceiptSummary = {
  id: string;
  retailer: string | null;
  purchasedAt: string | null;
  total: number | null;
  status: ReceiptStatusValue;
  importedAt: string | null;
  createdAt: string;
  itemCount: number;
  reviewedCount: number;
  foodCount: number;
};

export type ReceiptReviewItem = {
  id: string;
  rawDescription: string;
  normalisedName: string | null;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  isFood: boolean | null;
  location: PantryLocation | null;
  expiresAt: string | null;
};

export type ReceiptDetail = {
  id: string;
  retailer: string | null;
  purchasedAt: string | null;
  total: number | null;
  status: ReceiptStatusValue;
  importedAt: string | null;
  createdAt: string;
  items: ReceiptReviewItem[];
};
