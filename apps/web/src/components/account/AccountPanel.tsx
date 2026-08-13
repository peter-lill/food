"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { HealthConnectDevices } from "./HealthConnectDevices";
import { HealthConnectPairing } from "./HealthConnectPairing";
import { LocationPreferences } from "./LocationPreferences";
import { RetailerStorePreferences } from "./RetailerStorePreferences";
import styles from "./account.module.css";

type AccountPanelProps = {
  name: string;
  email: string;
  homePostcode: string;
  lockToHomeLocation: boolean;
  isOwner: boolean;
  enabledRetailers: ("Coles" | "Woolworths")[];
  preferredStores: Array<{ retailer: string; storeId: string; name: string; address: string | null; postcode: string | null; latitude: number | null; longitude: number | null }>;
};

export function AccountPanel({
  name,
  email,
  homePostcode,
  lockToHomeLocation,
  isOwner,
  enabledRetailers,
  preferredStores,
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

      <div className={styles.accountGrid}>
        {isOwner ? (
          <section className={`${styles.accountCard} ${styles.householdCard}`}>
            <div className={styles.cardIcon} aria-hidden="true">⚙</div>
            <div>
              <p className="eyebrow">OWNER ADMINISTRATION</p>
              <h2>Food Admin</h2>
              <p className="subtle">Manage Australian Product Knowledge, catalogue quality, enrichment and provider diagnostics.</p>
            </div>
            <Link className={styles.primaryLink} href="/admin">Open Admin</Link>
          </section>
        ) : null}

        <section className={`${styles.accountCard} ${styles.householdCard}`}>
          <div className={styles.cardIcon} aria-hidden="true">⌂</div>
          <div>
            <p className="eyebrow">HOUSEHOLDS</p>
            <h2>Cook and shop together</h2>
            <p className="subtle">Create a household, invite family members and share the planning workload.</p>
          </div>
          <Link className={styles.primaryLink} href="/households">Manage households</Link>
        </section>

        <details className={styles.collapsibleCard}>
          <summary><strong>Linked devices</strong><small>Review or disconnect Health Connect phones</small></summary>
          <div className={styles.collapsibleContent}><HealthConnectDevices /></div>
        </details>
        <details className={styles.collapsibleCard}>
          <summary><strong>Link phone</strong><small>Connect a new Android Health Connect device</small></summary>
          <div className={styles.collapsibleContent}><HealthConnectPairing /></div>
        </details>

        <LocationPreferences
          initialLocked={lockToHomeLocation}
          initialPostcode={homePostcode}
        />
        <RetailerStorePreferences
          homePostcode={homePostcode}
          initialEnabled={enabledRetailers}
          initialStores={preferredStores.filter((store): store is typeof store & { retailer: "Coles" | "Woolworths" } => store.retailer === "Coles" || store.retailer === "Woolworths")}
        />
      </div>
    </div>
  );
}
