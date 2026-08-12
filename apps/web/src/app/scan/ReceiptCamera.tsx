"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { stageReceiptCapture } from "@/lib/receipts/staged-receipt-capture";
import styles from "./scan.module.css";

export function ReceiptCamera() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("Use your phone camera and include the entire receipt, including its total.");
  const [capturing, setCapturing] = useState(false);

  async function captureReceipt(file: File) {
    if (capturing) return;
    setCapturing(true);
    setStatus("Saving receipt photo…");
    try {
      await stageReceiptCapture(file);
      router.push("/receipts?capture=staged");
    } catch (error) {
      console.error("Unable to capture receipt", error);
      setStatus(error instanceof Error ? error.message : "The receipt photo could not be captured.");
      setCapturing(false);
    }
  }

  return (
    <div className={styles.receiptCamera}>
      <input
        accept="image/*"
        capture="environment"
        className={styles.nativeCameraInput}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void captureReceipt(file);
        }}
        ref={cameraInputRef}
        type="file"
      />
      <div className={styles.receiptFrame}><span>Capture the whole receipt from its logo through the total.</span></div>
      <div className={styles.receiptStatus} role="status">{status}</div>
      <button aria-label="Open phone camera for receipt" className={styles.shutterButton} disabled={capturing} onClick={() => cameraInputRef.current?.click()} type="button"><span /></button>
    </div>
  );
}
