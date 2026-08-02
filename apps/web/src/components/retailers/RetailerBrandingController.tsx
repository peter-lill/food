"use client";

import { useEffect } from "react";

const retailerLogos = {
  Coles: "/retailer-logos/coles.svg",
  Woolworths: "/retailer-logos/woolworths.svg",
} as const;

type RetailerName = keyof typeof retailerLogos;

function retailerFromText(value: string): RetailerName | null {
  if (/\bWoolworths\b/i.test(value)) return "Woolworths";
  if (/\bColes\b/i.test(value)) return "Coles";
  return null;
}

function logo(retailer: RetailerName) {
  const image = document.createElement("img");
  image.src = retailerLogos[retailer];
  image.alt = retailer;
  image.loading = "lazy";
  image.className = "retailer-inline-logo";
  image.dataset.retailerBranding = retailer;
  return image;
}

function replaceRetailerText(element: HTMLElement) {
  if (element.dataset.retailerBrandingProcessed === "true") return;
  if (element.closest("option, select, input, textarea, script, style, [data-retailer-branding]") || element.children.length > 0) return;

  const text = element.textContent?.trim() ?? "";
  const retailer = retailerFromText(text);
  if (!retailer) return;

  const exact = new RegExp(`^${retailer}$`, "i");
  const special = new RegExp(`^(On special at|Best retailer:|Best complete store:)\\s+${retailer}(.*)$`, "i");
  const priceMeta = new RegExp(`^(On special|Regular price)\\s*·\\s*${retailer}(.*)$`, "i");
  const specialMatch = text.match(special);
  const priceMatch = text.match(priceMeta);

  if (exact.test(text)) {
    element.replaceChildren(logo(retailer));
  } else if (specialMatch) {
    element.replaceChildren(document.createTextNode(`${specialMatch[1]} `), logo(retailer), document.createTextNode(specialMatch[2] ?? ""));
  } else if (priceMatch) {
    element.replaceChildren(document.createTextNode(`${priceMatch[1]} · `), logo(retailer), document.createTextNode(priceMatch[2] ?? ""));
  } else {
    return;
  }

  element.dataset.retailerBrandingProcessed = "true";
  element.classList.add("retailer-inline");
}

function applyRetailerBranding(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("strong, span, small, p").forEach(replaceRetailerText);
}

export function RetailerBrandingController() {
  useEffect(() => {
    applyRetailerBranding(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            replaceRetailerText(node);
            applyRetailerBranding(node);
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
