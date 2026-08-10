"use client";

import { useRouter } from "next/navigation";
import styles from "./scan.module.css";

export function ScannerCloseButton({ href }: { href: "/pantry" | "/receipts" | "/shopping" }) {
  const router = useRouter();

  function closeScanner() {
    router.replace(href);
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
