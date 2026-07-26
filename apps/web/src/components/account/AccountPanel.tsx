"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { HealthConnectDevices } from "./HealthConnectDevices";
import { HealthConnectPairing } from "./HealthConnectPairing";
import { LocationPreferences } from "./LocationPreferences";
import styles from "./account.module.css";

type AccountPanelProps = {
  name: string;
  email: string;
  homeLocation: string;
  homePostcode: string;
  lockToHomeLocation: boolean;
};

export function AccountPanel({
  name,
  email,
  homeLocation,
  homePostcode,
  lockToHomeLocation,
}: AccountPanelProps) {
  const router = useRouter();
  const initial = name.trim().charAt(0).toUpperCase() || "F";

  async function signOut() {
    await authClient.signOut();
    router.push("/recipes");
    router.refresh();
  }

  return (
    <div className={styles.accountPage}>
      <section className={styles.profileHero}>
        <div className={styles.profileIdentity}>
          <span className={styles.profileAvatar} aria-hidden="true">{initial}</span>
          <div>
            <p className="eyebrow">YOUR FOOD ACCOUNT</p>
            <h1>{name}</h1>
            <p className={styles.email}>{email}</p>
          </div>
        </div>
        <div className={styles.profileActions}>
          <Link className={styles.secondaryLink} href="/recipes">Browse recipes</Link>
          <button className={styles.signOutButton} onClick={signOut} type="button">Sign out</button>
        </div>
      </section>

      <section className={styles.accountSummary} aria-label="Account benefits">
        <article>
          <span aria-hidden="true">♥</span>
          <div><strong>Favourites</strong><small>Saved across every signed-in device</small></div>
        </article>
        <article>
          <span aria-hidden="true">⌂</span>
          <div><strong>Households</strong><small>Plan and shop with the people you live with</small></div>
        </article>
        <article>
          <span aria-hidden="true">◎</span>
          <div><strong>Location aware</strong><small>Use your home store or current shopping location</small></div>
        </article>
      </section>

      <div className={styles.accountGrid}>
        <section className={`${styles.accountCard} ${styles.householdCard}`}>
          <div className={styles.cardIcon} aria-hidden="true">⌂</div>
          <div>
            <p className="eyebrow">HOUSEHOLDS</p>
            <h2>Cook and shop together</h2>
            <p className="subtle">Create a household, invite family members and share the planning workload.</p>
          </div>
          <Link className={styles.primaryLink} href="/households">Manage households</Link>
        </section>

        <HealthConnectDevices />
        <HealthConnectPairing />

        <LocationPreferences
          initialLocation={homeLocation}
          initialLocked={lockToHomeLocation}
          initialPostcode={homePostcode}
        />
      </div>
    </div>
  );
}
