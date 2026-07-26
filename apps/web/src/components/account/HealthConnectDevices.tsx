"use client";

import { useCallback, useEffect, useState } from "react";
import accountStyles from "./account.module.css";
import styles from "./health-connect-pairing.module.css";

type LinkedDevice = {
  id: string;
  deviceName: string;
  pairedAt: string;
  lastSyncedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "Not yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function HealthConnectDevices() {
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revokingId, setRevokingId] = useState("");

  const loadDevices = useCallback(async () => {
    try {
      const response = await fetch("/api/health-connect/devices", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = await response.json() as { devices?: LinkedDevice[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to load linked devices.");
      setDevices(result.devices ?? []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load linked devices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    const timer = window.setInterval(() => void loadDevices(), 5_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadDevices();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadDevices]);

  async function revokeDevice(device: LinkedDevice) {
    if (revokingId || !device.active) return;
    if (!window.confirm(`Disconnect ${device.deviceName}? It will need a new pairing code before it can sync again.`)) return;

    setRevokingId(device.id);
    setError("");
    try {
      const response = await fetch("/api/health-connect/devices", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: device.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to disconnect the device.");
      await loadDevices();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to disconnect the device.");
    } finally {
      setRevokingId("");
    }
  }

  const activeDevices = devices.filter((device) => device.active);
  const inactiveDevices = devices.filter((device) => !device.active);

  return (
    <section className={styles.card}>
      <div className={styles.intro}>
        <div>
          <p className="eyebrow">LINKED DEVICES</p>
          <h2>Your Health Connect devices</h2>
          <p className="subtle">Review the phones linked to this Food account and disconnect any device that should no longer sync.</p>
        </div>
        <span className={styles.badge}>{activeDevices.length} active</span>
      </div>

      {loading ? <p className="subtle">Loading linked devices…</p> : null}

      {!loading && activeDevices.length === 0 ? (
        <div className={styles.empty}><p>No active Android devices are linked to this account.</p></div>
      ) : null}

      {activeDevices.length > 0 ? (
        <div className={styles.deviceList}>
          {activeDevices.map((device) => (
            <article className={styles.deviceCard} key={device.id}>
              <div className={styles.deviceIcon} aria-hidden="true">▣</div>
              <div className={styles.deviceDetails}>
                <div className={styles.deviceHeading}>
                  <strong>{device.deviceName}</strong>
                  <span className={styles.activeStatus}>Connected</span>
                </div>
                <dl className={styles.deviceMeta}>
                  <div><dt>Paired</dt><dd>{formatDate(device.pairedAt)}</dd></div>
                  <div><dt>Last sync</dt><dd>{formatDate(device.lastSyncedAt)}</dd></div>
                  <div><dt>Token expires</dt><dd>{formatDate(device.expiresAt)}</dd></div>
                </dl>
              </div>
              <button
                className={accountStyles.signOutButton}
                disabled={revokingId === device.id}
                onClick={() => revokeDevice(device)}
                type="button"
              >
                {revokingId === device.id ? "Disconnecting…" : "Disconnect"}
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {inactiveDevices.length > 0 ? (
        <details className={styles.inactiveDevices}>
          <summary>{inactiveDevices.length} disconnected or expired device{inactiveDevices.length === 1 ? "" : "s"}</summary>
          <div className={styles.deviceList}>
            {inactiveDevices.map((device) => (
              <article className={`${styles.deviceCard} ${styles.inactiveDevice}`} key={device.id}>
                <div className={styles.deviceIcon} aria-hidden="true">▣</div>
                <div className={styles.deviceDetails}>
                  <div className={styles.deviceHeading}><strong>{device.deviceName}</strong><span>Disconnected</span></div>
                  <p className="subtle">Paired {formatDate(device.pairedAt)} · Last sync {formatDate(device.lastSyncedAt)}</p>
                </div>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      {error ? <p className={accountStyles.error} role="alert">{error}</p> : null}
    </section>
  );
}
