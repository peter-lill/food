"use client";

import { useEffect, useMemo, useState } from "react";
import accountStyles from "./account.module.css";
import styles from "./health-connect-pairing.module.css";

type PairingResponse = {
  code: string;
  expiresAt: string;
  expiresAtClient: number;
  pairingUri: string;
};

const storageKey = "food-health-connect-pairing";

function readStoredPairing(): PairingResponse | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PairingResponse>;
    if (!parsed.code || !parsed.expiresAt || !parsed.pairingUri) return null;

    const fallbackExpiry = new Date(parsed.expiresAt).getTime();
    const expiresAtClient = typeof parsed.expiresAtClient === "number"
      ? parsed.expiresAtClient
      : fallbackExpiry;

    if (!Number.isFinite(expiresAtClient)) return null;

    return {
      code: parsed.code,
      expiresAt: parsed.expiresAt,
      expiresAtClient,
      pairingUri: parsed.pairingUri,
    };
  } catch {
    return null;
  }
}

export function HealthConnectPairing() {
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stored = readStoredPairing();
    if (stored) setPairing(stored);
  }, []);

  useEffect(() => {
    if (!pairing) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  const secondsRemaining = pairing
    ? Math.max(0, Math.ceil((pairing.expiresAtClient - now) / 1_000))
    : 0;
  const expired = Boolean(pairing && secondsRemaining === 0);

  const qrUrl = useMemo(
    () => pairing
      ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(pairing.pairingUri)}`
      : "",
    [pairing],
  );

  async function copyCode() {
    if (!pairing) return;

    try {
      await navigator.clipboard.writeText(pairing.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("The pairing code could not be copied. Press and hold the code to copy it manually.");
    }
  }

  async function generateCode() {
    if (pending) return;

    setPending(true);
    setCopied(false);
    setError("");
    setMessage("Generating pairing code…");

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
        ? await response.json() as {
            code?: string;
            expiresAt?: string;
            expiresInSeconds?: number;
            pairingUri?: string;
            error?: string;
          }
        : { error: await response.text() };

      if (!response.ok) {
        throw new Error(result.error || `Unable to generate a pairing code (${response.status}).`);
      }

      if (!result.code || !result.expiresAt || !result.pairingUri) {
        throw new Error("The server returned an incomplete pairing response.");
      }

      const lifetimeSeconds = typeof result.expiresInSeconds === "number" && result.expiresInSeconds > 0
        ? result.expiresInSeconds
        : 600;
      const nextPairing: PairingResponse = {
        code: result.code,
        expiresAt: result.expiresAt,
        expiresAtClient: Date.now() + lifetimeSeconds * 1_000,
        pairingUri: result.pairingUri,
      };

      setPairing(nextPairing);
      window.sessionStorage.setItem(storageKey, JSON.stringify(nextPairing));
      setNow(Date.now());
      setMessage("Pairing code ready. Enter it in the Food Android app or scan the QR code.");
    } catch (caught) {
      setPairing(null);
      window.sessionStorage.removeItem(storageKey);
      setMessage("");
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
            Generate a one-time code for this account. Each Android phone receives its own device token, so more than one phone can be linked independently.
          </p>
        </div>
        <span className={styles.badge}>Health Connect</span>
      </div>

      {pairing ? (
        <div className={styles.layout}>
          <div className={styles.qrFrame}>
            <img alt="Health Connect pairing QR code" height="260" src={qrUrl} width="260" />
          </div>
          <div className={styles.details}>
            <span className={styles.label}>Pairing code</span>
            <strong className={styles.code}>{pairing.code.match(/.{1,5}/g)?.join(" ") ?? pairing.code}</strong>
            <div className={styles.pairingStatus}>
              {expired ? (
                <strong className={styles.expired}>This code has expired.</strong>
              ) : (
                <span>Expires in {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, "0")}</span>
              )}
            </div>
            <div className={styles.actions}>
              <button className={accountStyles.secondaryButton} disabled={expired} onClick={copyCode} type="button">
                {copied ? "Copied" : "Copy code"}
              </button>
              <button className={accountStyles.primaryButton} disabled={pending} onClick={generateCode} type="button">
                {pending ? "Generating…" : expired ? "Generate another code" : "Generate new code"}
              </button>
            </div>
            <ol>
              <li>Open the Food Android app.</li>
              <li>Open Sync, then enter the pairing code.</li>
              <li>Tap Pair device.</li>
              <li>Approve the Health Connect permissions you want to share.</li>
            </ol>
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

      {message ? <p className={accountStyles.success} role="status">{message}</p> : null}
      {error ? <p className={accountStyles.error} role="alert">{error}</p> : null}
    </section>
  );
}
