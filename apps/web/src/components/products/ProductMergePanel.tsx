import { mergeProduct } from "@/lib/products/product-merge.actions";
import { prisma } from "@/lib/prisma";

type ProductMergePanelProps = {
  sourceProductId: string;
  sourceProductName: string;
};

export async function ProductMergePanel({ sourceProductId, sourceProductName }: ProductMergePanelProps) {
  const targets = await prisma.product.findMany({
    where: { id: { not: sourceProductId }, lifecycle: { not: "ARCHIVED" } },
    select: { id: true, name: true, brand: true, packSize: true, barcode: true },
    orderBy: [{ name: "asc" }, { brand: "asc" }],
    take: 500,
  });

  if (!targets.length) return null;

  return (
    <article className="card">
      <details>
        <summary><strong>Merge duplicate product</strong></summary>
        <p className="subtle">
          Move all linked pantry, shopping, receipt, recipe, retailer and price records from <strong>{sourceProductName}</strong> into the product selected below. The current duplicate record will then be deleted.
        </p>
        <form action={mergeProduct.bind(null, sourceProductId)} className="pantry-form compact">
          <label className="field">
            <span>Product to keep</span>
            <select name="targetProductId" required defaultValue="">
              <option value="" disabled>Choose the surviving product</option>
              {targets.map((target) => {
                const details = [target.brand, target.packSize, target.barcode ? `GTIN ${target.barcode}` : null]
                  .filter(Boolean)
                  .join(" · ");
                return <option key={target.id} value={target.id}>{target.name}{details ? ` — ${details}` : ""}</option>;
              })}
            </select>
          </label>
          <label className="field">
            <span>
              <input name="confirmMerge" type="checkbox" value="yes" required />{" "}
              I understand that this duplicate product will be removed after its records are transferred.
            </span>
          </label>
          <div className="form-actions">
            <button className="danger-button" type="submit">Merge into selected product</button>
          </div>
        </form>
      </details>
    </article>
  );
}
