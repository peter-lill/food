"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createBarcodeDuplicateGuard } from "@/lib/scanner/duplicate-guard";

type DetectedBarcode = { rawValue: string };

type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

type ScannerControls = { stop(): void };

export type BarcodeScannerPhase =
  | "stopped"
  | "starting"
  | "scanning"
  | "processing"
  | "success"
  | "error";

export type BarcodeScanOutcome = {
  tone: "neutral" | "success" | "error";
  message: string;
};

type UseBarcodeScannerOptions = {
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onDetected(barcode: string): Promise<BarcodeScanOutcome>;
  duplicateWindowMs?: number;
  successDurationMs?: number;
};

const preferredFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

function getBarcodeDetector() {
  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

export function useBarcodeScanner({
  enabled,
  videoRef,
  onDetected,
  duplicateWindowMs = 1_500,
  successDurationMs = 1_000,
}: UseBarcodeScannerOptions) {
  const onDetectedRef = useRef(onDetected);
  const processingRef = useRef(false);
  const duplicateGuardRef = useRef(createBarcodeDuplicateGuard(duplicateWindowMs));
  const [phase, setPhase] = useState<BarcodeScannerPhase>(enabled ? "starting" : "stopped");
  const [status, setStatus] = useState(enabled ? "Starting the rear camera…" : "Camera ready when you are.");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    duplicateGuardRef.current = createBarcodeDuplicateGuard(duplicateWindowMs);
  }, [duplicateWindowMs]);

  useEffect(() => {
    if (!enabled) {
      duplicateGuardRef.current.reset();
      processingRef.current = false;
      setPhase("stopped");
      setStatus("Camera ready when you are.");
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setPhase("error");
      setStatus("This browser cannot access the camera. Enter the barcode manually instead.");
      return;
    }

    const Detector = getBarcodeDetector();
    let cancelled = false;
    let stream: MediaStream | null = null;
    let activeVideo: HTMLVideoElement | null = null;
    let scanTimer: ReturnType<typeof setTimeout> | null = null;
    let successTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackControls: ScannerControls | null = null;

    setPhase("starting");
    setStatus("Starting the rear camera…");

    async function processBarcode(rawBarcode: string) {
      const barcode = rawBarcode.trim();
      if (
        cancelled
        || processingRef.current
        || !duplicateGuardRef.current.accept(barcode)
      ) return;

      processingRef.current = true;
      setPhase("processing");
      setStatus(`Looking up barcode ${barcode}…`);

      try {
        const outcome = await onDetectedRef.current(barcode);
        if (cancelled) return;

        setStatus(outcome.message);
        setPhase(outcome.tone === "success" ? "success" : outcome.tone === "error" ? "error" : "scanning");
        navigator.vibrate?.(70);

        if (outcome.tone === "success") {
          successTimer = setTimeout(() => {
            if (cancelled) return;
            setPhase("scanning");
            setStatus("Camera is live. Present the next barcode.");
          }, successDurationMs);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Unable to process scanned barcode", error);
        setPhase("error");
        setStatus(error instanceof Error ? error.message : "Product lookup failed.");
      } finally {
        processingRef.current = false;
      }
    }

    async function startNativeScanner(ActiveDetector: BarcodeDetectorConstructor) {
      const supportedFormats = ActiveDetector.getSupportedFormats
        ? await ActiveDetector.getSupportedFormats()
        : preferredFormats;
      const formats = preferredFormats.filter((format) => supportedFormats.includes(format));
      const detector = new ActiveDetector(formats.length > 0 ? { formats } : undefined);

      stream = await mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      const video = videoRef.current;
      if (cancelled || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      activeVideo = video;
      video.srcObject = stream;
      await video.play();
      setPhase("scanning");
      setStatus("Camera is live. Hold a barcode inside the frame.");

      const scan = async () => {
        if (cancelled) return;
        try {
          const results = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            ? await detector.detect(video)
            : [];
          if (results[0]?.rawValue) void processBarcode(results[0].rawValue);
        } catch (error) {
          console.error("Unable to detect barcode", error);
        }
        if (!cancelled) scanTimer = setTimeout(scan, 240);
      };

      scanTimer = setTimeout(scan, 240);
    }

    async function startFallbackScanner() {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (cancelled || !videoRef.current) return;

      const reader = new BrowserMultiFormatReader();
      fallbackControls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result) => {
          if (result) void processBarcode(result.getText());
        },
      );

      if (cancelled) {
        fallbackControls.stop();
        return;
      }
      setPhase("scanning");
      setStatus("Camera is live. Hold a barcode inside the frame.");
    }

    const start = Detector ? startNativeScanner(Detector) : startFallbackScanner();
    void start.catch((error) => {
      if (cancelled) return;
      console.error("Unable to start barcode scanner", error);
      setPhase("error");
      setStatus("Camera access failed. Check browser permission for food.coffeehq.coffee or enter the barcode manually.");
    });

    return () => {
      cancelled = true;
      processingRef.current = false;
      if (scanTimer) clearTimeout(scanTimer);
      if (successTimer) clearTimeout(successTimer);
      fallbackControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (activeVideo) activeVideo.srcObject = null;
    };
  }, [enabled, successDurationMs, videoRef]);

  return { phase, status };
}
