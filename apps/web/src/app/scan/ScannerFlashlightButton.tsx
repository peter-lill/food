"use client";

import { useEffect, useState } from "react";
import styles from "./scan.module.css";

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

function currentVideoTrack() {
  const video = document.querySelector<HTMLVideoElement>("[data-food-scanner-video]");
  return video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] ?? null : null;
}

export function ScannerFlashlightButton() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const check = () => setAvailable(Boolean((currentVideoTrack()?.getCapabilities?.() as TorchCapabilities | undefined)?.torch));
    check();
    const timer = window.setInterval(check, 500);
    return () => window.clearInterval(timer);
  }, []);

  async function toggle() {
    const track = currentVideoTrack();
    if (!track || !available) return;
    const next = !enabled;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setEnabled(next);
    } catch (error) {
      console.error("Unable to change scanner flashlight", error);
    }
  }

  return (
    <button
      aria-label={available ? enabled ? "Turn flashlight off" : "Turn flashlight on" : "Flashlight unavailable"}
      aria-pressed={enabled}
      className={styles.flashlightButton}
      disabled={!available}
      onClick={() => void toggle()}
      type="button"
    >
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m9 3h6l1 5-3 3v8a1 1 0 0 1-2 0v-8L8 8Z" /><path d="M8 8h8" /></svg>
    </button>
  );
}
