"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import styles from "./account.module.css";

type InvitationDetails = {
  id: string;
  email: string;
  organizationName: string;
  organization?: {
    name: string;
  };
};

export function InvitationCard({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);

  useEffect(() => {
    async function loadInvitation() {
      const result = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });

      setPending(false);
      if (result.error) {
        setError(result.error.message ?? "This invitation is invalid or has expired.");
        return;
      }
      setInvitation(result.data as unknown as InvitationDetails);
    }

    void loadInvitation();
  }, [invitationId]);

  async function respond(accept: boolean) {
    setPending(true);
    setError("");
    const result = accept
      ? await authClient.organization.acceptInvitation({ invitationId })
      : await authClient.organization.rejectInvitation({ invitationId });

    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Unable to update this invitation.");
      return;
    }

    router.push(accept ? "/households" : "/recipes");
    router.refresh();
  }

  const householdName =
    invitation?.organization?.name ?? invitation?.organizationName ?? "this household";

  return (
    <section className={styles.invitationCard}>
      <p className="eyebrow">HOUSEHOLD INVITATION</p>
      <h1>Join {householdName}</h1>
      <p>
        Accepting adds your account to the household. Your personal recipe favourites remain private.
      </p>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.invitationActions}>
        <button
          className={styles.primaryButton}
          disabled={pending || !invitation}
          onClick={() => respond(true)}
          type="button"
        >
          Accept invitation
        </button>
        <button
          className={styles.secondaryButton}
          disabled={pending || !invitation}
          onClick={() => respond(false)}
          type="button"
        >
          Decline
        </button>
      </div>
    </section>
  );
}
