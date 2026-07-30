"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function sameUnit(left: string | null, right: string | null) {
  return (left ?? "item").trim().toLocaleLowerCase("en-AU") === (right ?? "item").trim().toLocaleLowerCase("en-AU");
}

export async function mergeShoppingDuplicates(listId: string, formData: FormData) {
  const keepId = clean(formData.get("keepId"));
  const duplicateId = clean(formData.get("duplicateId"));
  if (!keepId || !duplicateId || keepId === duplicateId) return;

  await prisma.$transaction(async (transaction) => {
    const items = await transaction.shoppingItem.findMany({
      where: { shoppingListId: listId, id: { in: [keepId, duplicateId] } },
      orderBy: { id: "asc" },
    });
    if (items.length !== 2) return;

    const keep = items.find((item) => item.id === keepId);
    const duplicate = items.find((item) => item.id === duplicateId);
    if (!keep || !duplicate) return;

    const canAdd = sameUnit(keep.unit, duplicate.unit);
    const quantity = canAdd
      ? (keep.quantity ?? 1) + (duplicate.quantity ?? 1)
      : keep.quantity ?? duplicate.quantity ?? 1;
    const unit = canAdd ? (keep.unit ?? duplicate.unit ?? "item") : (keep.unit ?? "item");

    await transaction.shoppingItem.update({
      where: { id: keep.id },
      data: {
        quantity,
        unit,
        checked: keep.checked && duplicate.checked,
        productId: keep.productId ?? duplicate.productId,
      },
    });
    await transaction.shoppingItem.delete({ where: { id: duplicate.id } });
  });

  revalidatePath("/shopping");
  revalidatePath("/prices");
}
