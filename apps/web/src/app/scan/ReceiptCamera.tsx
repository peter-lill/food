"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { stageReceiptCapture } from "@/lib/receipts/staged-receipt-capture";
import styles from "./scan.module.css";

export function ReceiptCamera() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Starting the rear camera…");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("This browser cannot access the camera. Choose a saved photo from Receipts instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("Hold steady and avoid glare.");
      } catch (error) {
        console.error("Unable to start receipt camera", error);
        setStatus("Camera access failed. Check browser permission or choose a saved photo from Receipts.");
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function captureReceipt() {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || capturing) return;
    setCapturing(true);
    setStatus("Saving receipt photo…");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The receipt image could not be prepared.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("The receipt photo could not be captured.")),
        "image/jpeg",
        .94,
      ));
      await stageReceiptCapture(new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }));
      router.push("/receipts?capture=staged");
    } catch (error) {
      console.error("Unable to capture receipt", error);
      setStatus(error instanceof Error ? error.message : "The receipt photo could not be captured.");
      setCapturing(false);
    }
  }

  return (
    <div className={styles.receiptCamera}>
      <video aria-label="Live receipt camera preview" autoPlay data-food-scanner-video muted playsInline ref={videoRef} />
      <div className={styles.receiptFrame} aria-hidden="true" />
      <div className={styles.receiptStatus} role="status">{status}</div>
      <button aria-label="Take receipt photo" className={styles.shutterButton} disabled={capturing} onClick={() => void captureReceipt()} type="button"><span /></button>
    </div>
  );
}
