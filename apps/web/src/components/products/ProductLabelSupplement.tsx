"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RetailerLogo } from "@/components/retailers/RetailerLogo";

type ProductLabelSupplementProps = { productId: string };
type Nutrition = {
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  saturatedFatGrams: number | null;
  fibreGrams: number | null;
  sugarGrams: number | null;
  sodiumMg: number | null;
};
type ProductLabelPayload = {
  productType: string;
  servingSize: string | null;
  servingQuantity: number | null;
  servingUnit: string | null;
  servingsPerPackage: number | null;
  nutrition: Nutrition;
  ingredientsText: string | null;
  contains: string[];
  mayContain: string[];
  retailers: string[];
};

type NutritionRow = { label: string; per100: string; perServing: string | null; sub?: boolean };

function displayAllergen(value: string) {
  return value
    .replace(/^[a-z]{2}:/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-AU"));
}

function oneDecimal(value: number) {
  return new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function quantity(value: number) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(value);
}

function findNutritionPanel() {
  const headings = [...document.querySelectorAll("h2")];
  const heading = headings.find((item) => item.textContent?.trim() === "Nutrition Information");
  return {
    panel: heading?.closest("article") ?? null,
    legacy: heading?.parentElement ?? null,
  };
}

export function ProductLabelSupplement({ productId }: ProductLabelSupplementProps) {
  const [payload, setPayload] = useState<ProductLabelPayload | null>(null);
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const found = findNutritionPanel();
    setTarget(found.panel);
    if (found.legacy instanceof HTMLElement) found.legacy.style.display = "none";

    fetch(`/api/products/${encodeURIComponent(productId)}/label`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<ProductLabelPayload> : null)
      .then(setPayload)
      .catch(() => setPayload(null));
  }, [productId]);

  const contains = useMemo(() => payload?.contains.map(displayAllergen) ?? [], [payload]);
  const mayContain = useMemo(() => payload?.mayContain.map(displayAllergen) ?? [], [payload]);
  const rows = useMemo<NutritionRow[]>(() => {
    if (!payload) return [];
    const factor = payload.servingQuantity !== null && ["g", "mL"].includes(payload.servingUnit ?? "")
      ? payload.servingQuantity / 100
      : null;
    const serving = (value: number, unit: string) => factor === null ? null : `${oneDecimal(value * factor)} ${unit}`;
    const n = payload.nutrition;
    return [
      n.calories === null ? null : { label: "Energy", per100: `${oneDecimal(n.calories * 4.184)} kJ`, perServing: serving(n.calories * 4.184, "kJ") },
      n.proteinGrams === null ? null : { label: "Protein", per100: `${oneDecimal(n.proteinGrams)} g`, perServing: serving(n.proteinGrams, "g") },
      n.fatGrams === null ? null : { label: "Fat, total", per100: `${oneDecimal(n.fatGrams)} g`, perServing: serving(n.fatGrams, "g") },
      n.saturatedFatGrams === null ? null : { label: "– saturated", per100: `${oneDecimal(n.saturatedFatGrams)} g`, perServing: serving(n.saturatedFatGrams, "g"), sub: true },
      n.carbsGrams === null ? null : { label: "Carbohydrate", per100: `${oneDecimal(n.carbsGrams)} g`, perServing: serving(n.carbsGrams, "g") },
      n.sugarGrams === null ? null : { label: "– sugars", per100: `${oneDecimal(n.sugarGrams)} g`, perServing: serving(n.sugarGrams, "g"), sub: true },
      n.fibreGrams === null ? null : { label: "Dietary fibre", per100: `${oneDecimal(n.fibreGrams)} g`, perServing: serving(n.fibreGrams, "g") },
      n.sodiumMg === null ? null : { label: "Sodium", per100: `${oneDecimal(n.sodiumMg)} mg`, perServing: serving(n.sodiumMg, "mg") },
    ].filter((row): row is NutritionRow => row !== null);
  }, [payload]);

  if (!target || !payload) return null;
  const hasPerServing = rows.some((row) => row.perServing !== null);
  const isFreshProduce = payload.productType === "GENERIC_PRODUCE";
  const servingSize = payload.servingSize
    ?? (payload.servingQuantity !== null && payload.servingUnit ? `${quantity(payload.servingQuantity)} ${payload.servingUnit}` : "Not recorded");

  return createPortal(
    <div className="product-label-complete">
      <section className="product-nip-complete">
        <h2>NUTRITION INFORMATION</h2>
        <p><strong>Servings per package:</strong> {payload.servingsPerPackage === null ? "Not recorded" : quantity(payload.servingsPerPackage)}</p>
        <p><strong>Serving size:</strong> {servingSize}</p>
        {rows.length ? (
          <table>
            <thead><tr><th>Nutrient</th>{hasPerServing ? <th>Avg qty per serving</th> : null}<th>Avg qty per 100 g / 100 mL</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.label}><th className={row.sub ? "product-nip-sub" : undefined}>{row.label}</th>{hasPerServing ? <td>{row.perServing ?? "—"}</td> : null}<td>{row.per100}</td></tr>)}</tbody>
          </table>
        ) : <p className="subtle">Nutrition values have not been recorded for this product yet.</p>}
      </section>

      <section className="product-label-section">
        <p className="eyebrow">INGREDIENTS</p>
        <h2>Ingredients</h2>
        <p className="product-label-copy">{payload.ingredientsText ?? "Ingredient information has not been recorded for this product yet. Always check the product packaging."}</p>
      </section>

      <section className="product-label-section">
        <p className="eyebrow">ALLERGEN INFORMATION</p>
        <h2>Contains</h2>
        {contains.length ? <div className="product-label-tags">{contains.map((item) => <span key={item}>{item}</span>)}</div> : <p className="subtle">{isFreshProduce ? "None" : "No contains statement has been recorded. Always check the product packaging."}</p>}
        <h2 className="product-label-subheading">May contain</h2>
        {mayContain.length ? <div className="product-label-tags">{mayContain.map((item) => <span key={item}>{item}</span>)}</div> : <p className="subtle">{isFreshProduce ? "None known" : "No may-contain statement has been recorded."}</p>}
      </section>

      {payload.retailers.length ? (
        <section className="product-label-section">
          <p className="eyebrow">AUSTRALIAN RETAILER SOURCES</p>
          <div className="product-label-retailers">{payload.retailers.map((retailer) => <RetailerLogo key={retailer} retailer={retailer} />)}</div>
        </section>
      ) : null}

      <style jsx global>{`
        .product-label-complete { display: grid; gap: 16px; }
        .product-nip-complete, .product-label-section { border: 1px solid var(--border, #d8ddd8); border-radius: 18px; background: var(--surface, #fff); padding: 24px; }
        .product-nip-complete h2 { border-bottom: 4px solid currentColor; padding-bottom: 8px; }
        .product-nip-complete table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        .product-nip-complete th, .product-nip-complete td { border-top: 1px solid currentColor; padding: 9px 8px; text-align: right; }
        .product-nip-complete th:first-child { text-align: left; }
        .product-nip-sub { padding-left: 24px !important; font-weight: 500; }
        .product-label-copy { line-height: 1.65; white-space: pre-wrap; }
        .product-label-subheading { margin-top: 24px !important; }
        .product-label-tags { display: flex; flex-wrap: wrap; gap: 8px; }
        .product-label-tags span { border: 1px solid var(--border, #d8ddd8); border-radius: 999px; padding: 7px 11px; font-weight: 700; }
        .product-label-retailers { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; }
      `}</style>
    </div>,
    target,
  );
}
