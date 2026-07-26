"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  generateHealthConnectPairingCode,
  type PairingActionState,
} from "@/lib/health/health-connect-pairing.actions";
import accountStyles from "./account.module.css";
import styles from "./health-connect-pairing.module.css";

const initialPairingActionState: PairingActionState = {
  status: "idle",
  message: "",
};

function GenerateButton({ secondary = false }: { secondary?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className={secondary ? accountStyles.secondaryButton : accountStyles.primaryButton}
      disabled={pending}
      type="submit"
    >
      {pending ? "Generating…" : secondary ? "Generate a new code" : "Generate pairing code"}
    </button>
  );
}

export function HealthConnectPairing() {
  const [state, action] = useActionState(
    generateHealthConnectPairingCode,
    initialPairingActionState,
  );
  const [now, setNow] = useState(() => Date.now());

  const pairing = state.status === "success" && state.code && state.expiresAt && state.pairingUri
    ? {
        code: state.code,
        expiresAt: state.expiresAt,
        pairingUri: state.pairingUri,
      }
    : null;

  useEffect(() => {
    if (!pairing) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pairing?.expiresAt]);

  const secondsRemaining = pairing
    ? Math.max(0, Math.ceil((new Date(pairing.expiresAt).getTime() - now) / 1_000))
    : 0;
  const qrUrl = useMemo(
    () => pairing
      ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(pairing.pairingUri)}`
      : "",
    [pairing],
  );

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
            <form action={action}>
              <GenerateButton secondary />
            </form>
          </div>
        </div>
      ) : (
        <div className={styles.empty}>
          <p>No active pairing code. Codes expire after 10 minutes and can only be used once.</p>
          <form action={action}>
            <GenerateButton />
          </form>
        </div>
      )}

      {state.status === "success" ? (
        <p className={accountStyles.success} role="status">{state.message}</p>
      ) : null}
      {state.status === "error" ? (
        <p className={accountStyles.error} role="alert">{state.message}</p>
      ) : null}
    </section>
  );
}
