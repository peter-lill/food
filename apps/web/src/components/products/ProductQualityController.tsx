"use client";

import { useEffect } from "react";
import { hasProductNameContamination, sanitiseProductName } from "@/lib/product-intelligence/product-name-quality";

function cleanVisibleProductNames(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("h1, h2, h3, [data-product-name]").forEach((element) => {
    const value = element.textContent?.trim() ?? "";
    if (!value || !hasProductNameContamination(value)) return;
    const sanitised = sanitiseProductName(value);
    if (!sanitised) return;
    element.textContent = sanitised;
    element.dataset.productNameSanitised = "true";
  });
}

function removeDuplicateReviewReasons(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("article").forEach((article) => {
    const text = article.textContent ?? "";
    if (!/needs details/i.test(text)) return;

    article.querySelectorAll<HTMLElement>("span, small, p").forEach((element) => {
      if (/^image missing$/i.test(element.textContent?.trim() ?? "")) {
        element.remove();
      }
    });
  });
}

function applyProductQuality(root: ParentNode) {
  cleanVisibleProductNames(root);
  removeDuplicateReviewReasons(root);
}

export function ProductQualityController() {
  useEffect(() => {
    applyProductQuality(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) applyProductQuality(node);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
