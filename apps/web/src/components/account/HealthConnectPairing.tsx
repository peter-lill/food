"use client";

import { useEffect, useMemo, useState } from "react";
import accountStyles from "./account.module.css";
import styles from "./health-connect-pairing.module.css";

type PairingResponse = {
  code: string;
  expiresAt: string;
  pairingUri: string;
};

export function HealthConnectPairing() {
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!pairing) return;
    setNow(Date.now());
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
    setPairing(null);

    try {
      const response = await fetch("/api/health-connect/pairing/generate", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });

      const contentType = response.headers.get("content-type") ?? "";
      const result = contentType.includes("application/json")
        ? await response.json() as Partial<PairingResponse> & { error?: string }
        : { error: await response.text() };

      if (!response.ok) {
        throw new Error(result.error || `Unable to generate a pairing code (${response.status}).`);
      }

      if (!result.code || !result.expiresAt || !result.pairingUri) {
        throw new Error("The server returned an incomplete pairing response.");
      }

      setPairing({
        code: result.code,
        expiresAt: result.expiresAt,
        pairingUri: result.pairingUri,
      });
      setNow(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate a pairing code.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.intro}>
        <div>
          <p className="eyebrow">ANDROID HEALTH CONNECT</p>
          <h2>Connect your phone</h2>
          <p className="subtle">
            Generate a one-time code for the signed-in account. Each Android phone exchanges the code for its own device token, so multiple phones can be linked independently.
          </p>
        </div>
        <span className={styles.badge}>Health Connect</span>
      </div>

      {pairing && secondsRemaining > 0 ? (
        <div className={styles.layout}>
          <div className={styles.qrFrame}>
            <img alt="Health Connect pairing QR code" height="260" src={qrUrl} width="260" />
          </div>
          <div className={styles.details}>
            <span className={styles.label}>Manual pairing code</span>
            <strong className={styles.code}>{pairing.code.match(/.{1,5}/g)?.join(" ")}</strong>
            <p className="subtle">Expires in {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, "0")}</p>
            <ol>
              <li>Open Food on your Android phone.</li>
              <li>Choose Health Connect, then Pair device.</li>
              <li>Scan this QR code or enter the code above.</li>
              <li>The app exchanges it once for a unique token for that phone.</li>
              <li>Approve the Health Connect permissions you want to share.</li>
            </ol>
            <button className={accountStyles.secondaryButton} disabled={pending} onClick={generateCode} type="button">
              {pending ? "Generating…" : "Generate a new code"}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.empty}>
          <p>No active pairing code. Codes expire after 10 minutes and can only be used once.</p>
          <button className={accountStyles.primaryButton} disabled={pending} onClick={generateCode} type="button">
            {pending ? "Generating…" : "Generate pairing code"}
          </button>
        </div>
      )}

      {error ? <p className={accountStyles.error} role="alert">{error}</p> : null}
    </section>
  );
}
