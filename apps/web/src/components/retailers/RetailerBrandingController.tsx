"use client";

import { useEffect } from "react";

const retailerLogos = {
  Woolworths: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Woolworths_Limited_Logo.svg",
  Coles: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Coles_logo.svg",
  ALDI: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Aldi_S%C3%BCd_2017_logo.svg",
  IGA: "https://commons.wikimedia.org/wiki/Special:Redirect/file/IGA_logo.svg",
  Drakes: "https://dtgxwmigmg3gc.cloudfront.net/images/5a615f7252ba0b73b201addb",
  Costco: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Costco_Wholesale.svg",
} as const;

type RetailerName = keyof typeof retailerLogos;

const retailerPatterns: Array<[RetailerName, RegExp]> = [
  ["Woolworths", /\b(?:Woolworths|Woolies)\b/i],
  ["Coles", /\bColes\b/i],
  ["ALDI", /\bALDI\b/i],
  ["IGA", /\bIGA\b/i],
  ["Drakes", /\bDrakes(?:\s+Supermarkets?)?\b/i],
  ["Costco", /\bCostco(?:\s+Wholesale)?\b/i],
];

function retailerFromText(value: string): RetailerName | null {
  return retailerPatterns.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

function retailerPattern(retailer: RetailerName) {
  return retailerPatterns.find(([name]) => name === retailer)?.[1] ?? new RegExp(retailer, "i");
}

function logo(retailer: RetailerName) {
  const image = document.createElement("img");
  image.src = retailerLogos[retailer];
  image.alt = retailer;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.className = "retailer-inline-logo";
  image.dataset.retailerBranding = retailer;
  image.style.background = "transparent";
  image.style.objectFit = "contain";
  return image;
}

function replaceRetailerText(element: HTMLElement) {
  if (element.dataset.retailerBrandingProcessed === "true") return;
  if (element.closest("option, select, input, textarea, script, style, [data-retailer-branding]") || element.children.length > 0) return;

  const text = element.textContent?.trim() ?? "";
  const retailer = retailerFromText(text);
  if (!retailer) return;

  const namePattern = retailerPattern(retailer).source.replace(/^\\b|\\b$/g, "");
  const exact = new RegExp(`^(?:${namePattern})$`, "i");
  const special = new RegExp(`^(On special at|Best retailer:|Best complete store:)\\s+(?:${namePattern})(.*)$`, "i");
  const priceMeta = new RegExp(`^(On special|Regular price)\\s*·\\s*(?:${namePattern})(.*)$`, "i");
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
