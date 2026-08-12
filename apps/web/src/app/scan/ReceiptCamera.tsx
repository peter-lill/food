"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { stageReceiptCapture } from "@/lib/receipts/staged-receipt-capture";
import styles from "./scan.module.css";

export function ReceiptCamera() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("Starting the rear camera…");
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    void navigator.mediaDevices?.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    }).then(async (result) => {
      stream = result;
      if (cancelled || !videoRef.current) return result.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = result;
      await videoRef.current.play();
      setCameraReady(true);
      setStatus("Fit the entire receipt and total inside the visible camera image, then press the shutter once.");
    }).catch((error) => {
      console.error("Unable to start receipt camera", error);
      setStatus("The in-app camera is unavailable. Use the full-resolution camera option below.");
    });
    return () => { cancelled = true; stream?.getTracks().forEach((track) => track.stop()); };
  }, []);

  async function stage(file: File) {
    await stageReceiptCapture(file);
    router.push("/receipts?capture=staged");
  }

  async function captureVisibleFrame() {
    const video = videoRef.current;
    if (!video || !cameraReady || capturing) return;
    setCapturing(true); setStatus("Saving the visible camera image…");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The receipt image could not be prepared.");
      // object-fit: contain exposes the complete sensor frame. Saving that full
      // frame guarantees OCR receives exactly the camera content visible here.
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("The receipt photo could not be captured.")),
        "image/jpeg", .95,
      ));
      await stage(new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }));
    } catch (error) {
      console.error("Unable to capture receipt", error);
      setStatus(error instanceof Error ? error.message : "The receipt photo could not be captured.");
      setCapturing(false);
    }
  }

  return (
    <div className={styles.receiptCamera}>
      <div className={styles.receiptFrame}>
        <video aria-label="Live receipt camera preview" autoPlay muted playsInline ref={videoRef} />
      </div>
      <div className={styles.receiptStatus} role="status">{status}</div>
      <button aria-label="Take receipt photo" className={styles.shutterButton} disabled={!cameraReady || capturing} onClick={() => void captureVisibleFrame()} type="button"><span /></button>
      <button className={styles.fullResolutionButton} disabled={capturing} onClick={() => nativeInputRef.current?.click()} type="button">Use full-resolution camera</button>
      <input
        accept="image/*" capture="environment" className={styles.nativeCameraInput} ref={nativeInputRef} type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
          if (!file || capturing) return;
          setCapturing(true); setStatus("Saving the full-resolution receipt photo…");
          void stage(file).catch((error) => { console.error("Unable to stage receipt", error); setCapturing(false); setStatus("The receipt photo could not be saved."); });
        }}
      />
    </div>
  );
}
