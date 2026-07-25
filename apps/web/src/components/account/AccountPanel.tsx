"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
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

  async function signOut() {
    await authClient.signOut();
    router.push("/recipes");
    router.refresh();
  }

  return (
    <div className={styles.accountGrid}>
      <section className={styles.accountCard}>
        <p className="eyebrow">PROFILE</p>
        <h1>{name}</h1>
        <p className={styles.email}>{email}</p>
        <p className="subtle">
          Your favourite recipes are attached to this account and available on every device.
        </p>
        <button className={styles.secondaryButton} onClick={signOut} type="button">
          Sign out
        </button>
      </section>

      <section className={styles.accountCard}>
        <p className="eyebrow">HOUSEHOLDS</p>
        <h2>Cook together</h2>
        <p className="subtle">
          Create a household or accept an invitation from someone you know.
        </p>
        <Link className={styles.primaryLink} href="/households">
          Manage households
        </Link>
      </section>

      <HealthConnectPairing />

      <LocationPreferences
        initialLocation={homeLocation}
        initialLocked={lockToHomeLocation}
        initialPostcode={homePostcode}
      />
    </div>
  );
}
