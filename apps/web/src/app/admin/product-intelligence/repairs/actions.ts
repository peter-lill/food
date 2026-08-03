"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerSession } from "@/lib/auth-session";
import {
  approveProductRepair,
  queueProductNameRepairSuggestions,
  rejectProductRepair,
  rollbackProductNameChange,
} from "@/lib/product-intelligence/product-repair-workflow";

export async function generateRepairSuggestionsAction(formData: FormData) {
  const session = await requireOwnerSession();
  const requested = Number(formData.get("limit") ?? 500);
  await queueProductNameRepairSuggestions(Number.isFinite(requested) ? requested : 500, session.user.email);
  revalidatePath("/admin/product-intelligence/repairs");
  revalidatePath("/admin");
}

export async function approveRepairAction(formData: FormData) {
  const session = await requireOwnerSession();
  const suggestionId = String(formData.get("suggestionId") ?? "");
  if (!suggestionId) throw new Error("Repair suggestion is required.");
  const result = await approveProductRepair(suggestionId, session.user.email);
  revalidatePath("/admin/product-intelligence/repairs");
  revalidatePath(`/admin/product-intelligence/inspector?productId=${result.productId}`);
  revalidatePath("/products");
}

export async function rejectRepairAction(formData: FormData) {
  const session = await requireOwnerSession();
  const suggestionId = String(formData.get("suggestionId") ?? "");
  if (!suggestionId) throw new Error("Repair suggestion is required.");
  await rejectProductRepair(suggestionId, session.user.email);
  revalidatePath("/admin/product-intelligence/repairs");
  revalidatePath("/admin");
}

export async function rollbackNameChangeAction(formData: FormData) {
  const session = await requireOwnerSession();
  const historyId = String(formData.get("historyId") ?? "");
  if (!historyId) throw new Error("Change history entry is required.");
  const result = await rollbackProductNameChange(historyId, session.user.email);
  revalidatePath(`/admin/product-intelligence/inspector?productId=${result.productId}`);
  revalidatePath("/admin/product-intelligence/repairs");
  revalidatePath("/products");
}
