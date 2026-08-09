"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./account.module.css";

type LocationPreferencesProps = {
  initialLocation: string;
  initialPostcode: string;
  initialLocked: boolean;
};

export function LocationPreferences({
  initialLocation,
  initialPostcode,
  initialLocked,
}: LocationPreferencesProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/account/preferences/location", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        homeLocation: String(formData.get("homeLocation") ?? ""),
        homePostcode: String(formData.get("homePostcode") ?? ""),
        lockToHomeLocation: formData.get("lockToHomeLocation") === "on",
      }),
    });
    const result = await response.json() as { error?: string };
    setPending(false);

    if (!response.ok) {
      setError(result.error ?? "Unable to save your home location.");
      return;
    }

    setMessage("Home location saved.");
    router.refresh();
  }

  return (
    <section className={`${styles.accountCard} ${styles.locationCard}`}>
      <p className="eyebrow">HOME LOCATION</p>
      <h2>Set your shopping area</h2>
      <p className="subtle">
        This is your fallback shopping area. You can still use your device&apos;s
        current location when you are away from home.
      </p>

      <form className={styles.locationForm} onSubmit={saveLocation}>
        <label>
          <span>Suburb, city or region</span>
          <input
            defaultValue={initialLocation}
            maxLength={120}
            minLength={2}
            name="homeLocation"
            placeholder="Springwood, Queensland, Australia"
            required
          />
        </label>
        <label>
          <span>Postcode</span>
          <input
            autoComplete="postal-code"
            defaultValue={initialPostcode}
            inputMode="text"
            maxLength={12}
            name="homePostcode"
            placeholder="4127"
          />
        </label>
        <label className={styles.lockLocation}>
          <input
            defaultChecked={initialLocked}
            name="lockToHomeLocation"
            type="checkbox"
          />
          <span>
            <strong>Use home for automatic searches</strong>
            <small>
              Current location is used only when you explicitly choose it for a
              search or scan.
            </small>
          </span>
        </label>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {message ? <p className={styles.success} role="status">{message}</p> : null}

        <button className={styles.primaryButton} disabled={pending} type="submit">
          {pending ? "Saving…" : "Save home location"}
        </button>
      </form>
    </section>
  );
}
