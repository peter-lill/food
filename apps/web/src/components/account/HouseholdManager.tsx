"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import styles from "./account.module.css";

type HouseholdSummary = {
  id: string;
  name: string;
  slug: string;
};

type HouseholdMember = {
  id: string;
  role: string;
  user: {
    name: string;
    email: string;
  };
};

type HouseholdInvitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date | string;
};

type HouseholdDetails = HouseholdSummary & {
  members: HouseholdMember[];
};

function makeSlug(name: string) {
  const stem = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "household";

  return `${stem}-${crypto.randomUUID().slice(0, 6)}`;
}

export function HouseholdManager({ currentUserEmail }: { currentUserEmail: string }) {
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [details, setDetails] = useState<HouseholdDetails | null>(null);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadHouseholds = useCallback(async () => {
    const result = await authClient.organization.list();

    if (result.error) {
      setError(result.error.message ?? "Unable to load households.");
      return;
    }

    const rows = (result.data ?? []) as HouseholdSummary[];
    setHouseholds(rows);
    setSelectedId((current) => current || rows[0]?.id || "");
  }, []);

  const loadDetails = useCallback(async (organizationId: string) => {
    if (!organizationId) {
      setDetails(null);
      setInvitations([]);
      return;
    }

    await authClient.organization.setActive({ organizationId });
    const [householdResult, invitationResult] = await Promise.all([
      authClient.organization.getFullOrganization({
        query: { organizationId, membersLimit: 100 },
      }),
      authClient.organization.listInvitations({
        query: { organizationId },
      }),
    ]);

    if (householdResult.error) {
      setError(householdResult.error.message ?? "Unable to load that household.");
      return;
    }

    setDetails(householdResult.data as unknown as HouseholdDetails);
    setInvitations(
      (invitationResult.data ?? []) as unknown as HouseholdInvitation[],
    );
  }, []);

  useEffect(() => {
    // This effect synchronises the component with Better Auth's remote organization store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHouseholds();
  }, [loadHouseholds]);

  useEffect(() => {
    // This effect reloads the remote household when the selected organization changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDetails(selectedId);
  }, [loadDetails, selectedId]);

  async function createHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const result = await authClient.organization.create({
      name,
      slug: makeSlug(name),
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Unable to create the household.");
      return;
    }

    form.reset();
    setMessage(`${name} was created.`);
    await loadHouseholds();
    if (result.data?.id) setSelectedId(result.data.id);
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;

    setError("");
    setMessage("");
    setPending(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const result = await authClient.organization.inviteMember({
      email,
      role: "member",
      organizationId: selectedId,
      resend: true,
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Unable to send that invitation.");
      return;
    }

    form.reset();
    setMessage(`Invitation sent to ${email}.`);
    await loadDetails(selectedId);
  }

  const currentMember = details?.members.find(
    (member) =>
      member.user.email.toLocaleLowerCase() === currentUserEmail.toLocaleLowerCase(),
  );
  const canManage = currentMember?.role === "owner" || currentMember?.role === "admin";

  return (
    <div className={styles.householdLayout}>
      <section className={styles.accountCard}>
        <p className="eyebrow">NEW HOUSEHOLD</p>
        <h1>Create a household</h1>
        <p className="subtle">
          Households group people you trust. Favourite recipes remain personal.
        </p>
        <form className={styles.inlineForm} onSubmit={createHousehold}>
          <label>
            <span>Household name</span>
            <input maxLength={80} minLength={2} name="name" placeholder="The Smith household" required />
          </label>
          <button className={styles.primaryButton} disabled={pending} type="submit">
            Create household
          </button>
        </form>
      </section>

      {households.length > 0 ? (
        <section className={styles.accountCard}>
          <div className={styles.cardHeading}>
            <div>
              <p className="eyebrow">YOUR HOUSEHOLDS</p>
              <h2>Members and invitations</h2>
            </div>
            <select
              aria-label="Choose household"
              onChange={(event) => setSelectedId(event.target.value)}
              value={selectedId}
            >
              {households.map((household) => (
                <option key={household.id} value={household.id}>{household.name}</option>
              ))}
            </select>
          </div>

          {details ? (
            <>
              <div className={styles.memberList}>
                {details.members.map((member) => (
                  <div className={styles.memberRow} key={member.id}>
                    <span className={styles.avatar}>{member.user.name.slice(0, 1).toLocaleUpperCase()}</span>
                    <span>
                      <strong>{member.user.name}</strong>
                      <small>{member.user.email}</small>
                    </span>
                    <span className={styles.role}>{member.role}</span>
                  </div>
                ))}
              </div>

              {canManage ? (
                <form className={styles.inviteForm} onSubmit={inviteMember}>
                  <label>
                    <span>Invite someone by email</span>
                    <input name="email" placeholder="person@example.com" required type="email" />
                  </label>
                  <button className={styles.primaryButton} disabled={pending} type="submit">
                    Send invitation
                  </button>
                </form>
              ) : null}

              {invitations.length > 0 ? (
                <div className={styles.pendingInvites}>
                  <strong>Pending invitations</strong>
                  {invitations
                    .filter((invitation) => invitation.status === "pending")
                    .map((invitation) => (
                      <span key={invitation.id}>{invitation.email}</span>
                    ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : (
        <section className={styles.emptyHousehold}>
          <strong>No households yet.</strong>
          <p>Create one above, or follow an invitation sent to your email.</p>
        </section>
      )}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {message ? <p className={styles.success} role="status">{message}</p> : null}
    </div>
  );
}
