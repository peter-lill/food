"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { stageReceiptCapture } from "@/lib/receipts/staged-receipt-capture";
import { projectCropToImage, visibleFrameSourceCrop } from "@/lib/receipts/camera-frame-crop";
import styles from "./scan.module.css";

export function ReceiptCamera() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
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
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("Fit the entire receipt, including its total, inside the guide.");
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
    const frame = frameRef.current;
    if (!video || !frame || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || capturing) return;
    setCapturing(true);
    setStatus("Saving receipt photo…");
    try {
      const videoBounds = video.getBoundingClientRect();
      const frameBounds = frame.getBoundingClientRect();
      const crop = visibleFrameSourceCrop(
        { width: video.videoWidth, height: video.videoHeight },
        { left: videoBounds.left, top: videoBounds.top, width: videoBounds.width, height: videoBounds.height },
        { left: frameBounds.left, top: frameBounds.top, width: frameBounds.width, height: frameBounds.height },
      );
      if (!crop) throw new Error("The visible receipt frame could not be captured. Please retake the photo.");
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
      const ImageCaptureConstructor = (globalThis as typeof globalThis & {
        ImageCapture?: new (track: MediaStreamTrack) => { takePhoto(): Promise<Blob> };
      }).ImageCapture;
      let source: CanvasImageSource = video;
      let sourceCrop = crop;
      let capturedBitmap: ImageBitmap | null = null;
      if (track && ImageCaptureConstructor) {
        try {
          const fullResolutionPhoto = await new ImageCaptureConstructor(track).takePhoto();
          capturedBitmap = await createImageBitmap(fullResolutionPhoto);
          const projectedCrop = projectCropToImage(
            crop,
            { width: video.videoWidth, height: video.videoHeight },
            { width: capturedBitmap.width, height: capturedBitmap.height },
          );
          if (projectedCrop) {
            source = capturedBitmap;
            sourceCrop = projectedCrop;
          }
        } catch (error) {
          console.warn("Full-resolution receipt photo unavailable; using the camera stream frame", error);
        }
      }
      if (sourceCrop.width < 700) {
        capturedBitmap?.close();
        throw new Error("The camera did not provide enough receipt detail. Move closer or choose a saved photo.");
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sourceCrop.width);
      canvas.height = Math.round(sourceCrop.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The receipt image could not be prepared.");
      context.drawImage(source, sourceCrop.left, sourceCrop.top, sourceCrop.width, sourceCrop.height, 0, 0, canvas.width, canvas.height);
      capturedBitmap?.close();
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
      <div className={styles.receiptFrame} aria-hidden="true" ref={frameRef} />
      <div className={styles.receiptStatus} role="status">{status}</div>
      <button aria-label="Take receipt photo" className={styles.shutterButton} disabled={capturing} onClick={() => void captureReceipt()} type="button"><span /></button>
    </div>
  );
}
