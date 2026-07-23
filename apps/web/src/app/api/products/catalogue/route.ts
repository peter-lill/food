import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DeleteProductRequest = {
  name?: unknown;
  barcode?: unknown;
};

function cleanText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function refreshProductPages() {
  revalidatePath("/pantry");
  revalidatePath("/shopping");
  revalidatePath("/");
}

export async function DELETE(request: Request) {
  let payload: DeleteProductRequest;

  try {
    payload = await request.json() as DeleteProductRequest;
  } catch {
    return NextResponse.json({ error: "The saved product request was invalid." }, { status: 400 });
  }

  const name = cleanText(payload.name, 100);
  const barcode = cleanText(payload.barcode, 80);

  if (!name) {
    return NextResponse.json({ error: "The saved product name is required." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const matches = await transaction.product.findMany({
        where: barcode
          ? { barcode }
          : { name: { equals: name, mode: "insensitive" } },
        include: { _count: { select: { inventoryItems: true } } },
        take: 2,
      });

      if (matches.length === 0) return { status: "missing" as const };
      if (matches.length > 1) return { status: "ambiguous" as const };

      const product = matches[0];
      if (product._count.inventoryItems > 0) {
        return { status: "in-use" as const, name: product.name };
      }

      await transaction.product.delete({ where: { id: product.id } });
      return { status: "deleted" as const, id: product.id, name: product.name };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    if (result.status === "missing") {
      return NextResponse.json({ error: "This saved product no longer exists." }, { status: 404 });
    }

    if (result.status === "ambiguous") {
      return NextResponse.json(
        { error: "More than one saved product has this name. Add or scan its barcode before deleting it." },
        { status: 409 },
      );
    }

    if (result.status === "in-use") {
      return NextResponse.json(
        { error: `${result.name} is still in Pantry. Consume or remove that stock before deleting the saved product.` },
        { status: 409 },
      );
    }

    refreshProductPages();
    return NextResponse.json({ deleted: true, product: { id: result.id, name: result.name } });
  } catch (error) {
    console.error("Unable to delete saved product", error);
    return NextResponse.json(
      { error: "The saved product could not be deleted. Try again." },
      { status: 500 },
    );
  }
}
