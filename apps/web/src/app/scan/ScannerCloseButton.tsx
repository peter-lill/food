"use client";

import { useRouter } from "next/navigation";
import styles from "./scan.module.css";

export function ScannerCloseButton() {
  const router = useRouter();

  function closeScanner() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.replace("/pantry");
  }

  return (
    <button
      aria-label="Close scanner"
      className={styles.closeButton}
      onClick={closeScanner}
      type="button"
    >
      ×
    </button>
  );
}
