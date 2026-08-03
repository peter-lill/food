"use client";

import { useEffect } from "react";

export function PlannerCopyCorrection() {
  useEffect(() => {
    const correctLabel = () => {
      for (const element of document.querySelectorAll("span")) {
        if (element.textContent?.trim() === "Recipe source") {
          element.textContent = "Recipe library";
        }
      }
    };

    correctLabel();
    const observer = new MutationObserver(correctLabel);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
