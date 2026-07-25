"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./account.module.css";

type PairingResponse = {
  code: string;
  expiresAt: string;
  pairingUri: string;
};

export function HealthConnectPairing() {
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  const secondsRemaining = pairing
    ? Math.max(0, Math.ceil((new Date(pairing.expiresAt).getTime() - now) / 1_000))
    : 0;
  const qrUrl = useMemo(
    () => pairing
      ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(pairing.pairingUri)}`
      : "",
    [pairing],
  );

  async function generateCode() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/health-connect/pairing", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to generate a pairing code.");
      setPairing(result);
      setNow(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate a pairing code.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={`${styles.accountCard} ${styles.healthConnectCard}`}>
      <div className={styles.healthConnectIntro}>
        <div>
          <p className="eyebrow">ANDROID HEALTH CONNECT</p>
          <h2>Connect your phone</h2>
          <p className="subtle">
            Generate a one-time code, then scan it in the Food Android app to authorise Health Connect syncing.
          </p>
        </div>
        <span className={styles.healthConnectBadge}>Health Connect</span>
      </div>

      {pairing && secondsRemaining > 0 ? (
        <div className={styles.pairingLayout}>
          <div className={styles.qrFrame}>
            {/* The QR contains only an expiring one-time pairing URI. */}
            <img alt="Health Connect pairing QR code" height="260" src={qrUrl} width="260" />
          </div>
          <div className={styles.pairingDetails}>
            <span className={styles.pairingLabel}>Manual pairing code</span>
            <strong className={styles.pairingCode}>{pairing.code.match(/.{1,5}/g)?.join(" ")}</strong>
            <p className="subtle">Expires in {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, "0")}</p>
            <ol>
              <li>Open Food on your Android phone.</li>
              <li>Choose Health Connect, then Pair device.</li>
              <li>Scan this QR code or enter the code above.</li>
              <li>Approve the Health Connect permissions you want to share.</li>
            </ol>
            <button className={styles.secondaryButton} disabled={pending} onClick={generateCode} type="button">
              Generate a new code
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.healthConnectEmpty}>
          <p>No active pairing code. Codes expire after 10 minutes and can only be used once.</p>
          <button className={styles.primaryButton} disabled={pending} onClick={generateCode} type="button">
            {pending ? "Generating…" : "Generate pairing code"}
          </button>
        </div>
      )}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
