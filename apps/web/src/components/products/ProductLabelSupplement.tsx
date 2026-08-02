"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RetailerLogo } from "@/components/retailers/RetailerLogo";

type ProductLabelSupplementProps = { productId: string };
type ProductLabelPayload = {
  ingredientsText: string | null;
  contains: string[];
  mayContain: string[];
  retailers: string[];
};

function displayAllergen(value: string) {
  return value
    .replace(/^[a-z]{2}:/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-AU"));
}

function findNutritionPanel() {
  const headings = [...document.querySelectorAll("h2")];
  const heading = headings.find((item) => item.textContent?.trim() === "Nutrition Information");
  return heading?.closest("article") ?? null;
}

export function ProductLabelSupplement({ productId }: ProductLabelSupplementProps) {
  const [payload, setPayload] = useState<ProductLabelPayload | null>(null);
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    setTarget(findNutritionPanel());
    fetch(`/api/products/${encodeURIComponent(productId)}/label`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<ProductLabelPayload> : null)
      .then(setPayload)
      .catch(() => setPayload(null));
  }, [productId]);

  const contains = useMemo(() => payload?.contains.map(displayAllergen) ?? [], [payload]);
  const mayContain = useMemo(() => payload?.mayContain.map(displayAllergen) ?? [], [payload]);

  if (!target || !payload) return null;

  return createPortal(
    <div className="product-label-supplement">
      <section className="product-label-section">
        <p className="eyebrow">INGREDIENTS</p>
        <h2>Ingredients</h2>
        <p className="product-label-copy">
          {payload.ingredientsText ?? "Ingredient information has not been recorded for this product yet. Always check the product packaging."}
        </p>
      </section>

      <section className="product-label-section">
        <p className="eyebrow">ALLERGEN INFORMATION</p>
        <h2>Contains</h2>
        {contains.length ? (
          <div className="product-label-tags">{contains.map((item) => <span key={item}>{item}</span>)}</div>
        ) : (
          <p className="subtle">No contains statement has been recorded. Always check the product packaging.</p>
        )}

        <h2 className="product-label-subheading">May contain</h2>
        {mayContain.length ? (
          <div className="product-label-tags">{mayContain.map((item) => <span key={item}>{item}</span>)}</div>
        ) : (
          <p className="subtle">No may-contain statement has been recorded.</p>
        )}
      </section>

      {payload.retailers.length ? (
        <section className="product-label-section product-label-sources">
          <p className="eyebrow">AUSTRALIAN RETAILER SOURCES</p>
          <div className="product-label-retailers">
            {payload.retailers.map((retailer) => <RetailerLogo key={retailer} retailer={retailer} />)}
          </div>
        </section>
      ) : null}

      <style jsx global>{`
        .product-label-supplement {
          display: grid;
          gap: 16px;
          margin-top: 16px;
        }
        .product-label-section {
          border: 1px solid var(--border, #d8ddd8);
          border-radius: 18px;
          background: var(--surface, #fff);
          padding: 24px;
        }
        .product-label-section h2 {
          margin: 4px 0 12px;
        }
        .product-label-copy {
          line-height: 1.65;
          white-space: pre-wrap;
        }
        .product-label-subheading {
          margin-top: 24px !important;
        }
        .product-label-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .product-label-tags span {
          border: 1px solid var(--border, #d8ddd8);
          border-radius: 999px;
          padding: 7px 11px;
          font-weight: 700;
        }
        .product-label-retailers {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 18px;
        }
      `}</style>
    </div>,
    target,
  );
}
