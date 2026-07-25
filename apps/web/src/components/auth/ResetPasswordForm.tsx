"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import styles from "./auth.module.css";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("This password reset link is invalid or has expired.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");

    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setPending(true);
    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Unable to reset your password.");
      return;
    }

    router.push("/sign-in");
  }

  return (
    <div className={styles.authCard}>
      <div className={styles.authHeading}>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Choose a new password</h1>
        <p>Use at least 12 characters and avoid reusing a password from another service.</p>
      </div>

      <form className={styles.authForm} onSubmit={submit}>
        <label>
          <span>New password</span>
          <input autoComplete="new-password" minLength={12} name="password" required type="password" />
        </label>
        <label>
          <span>Confirm password</span>
          <input autoComplete="new-password" minLength={12} name="confirmation" required type="password" />
        </label>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <button className={styles.primaryButton} disabled={pending || !token} type="submit">
          {pending ? "Saving…" : "Save new password"}
        </button>
      </form>

      <div className={styles.authActions}>
        <Link href="/sign-in">Return to sign in</Link>
      </div>
    </div>
  );
}
