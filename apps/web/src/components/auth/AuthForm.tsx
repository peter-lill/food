"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import styles from "./auth.module.css";

type AuthMode = "sign-in" | "sign-up" | "forgot";

function safeCallbackUrl(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function AuthForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const callbackURL = safeCallbackUrl(searchParams.get("callbackURL"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();

    try {
      if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (result.error) throw new Error(result.error.message);
        setMessage("If that account exists, a password reset link has been sent.");
        return;
      }

      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL,
        });

        if (result.error) throw new Error(result.error.message);
        setMessage("Check your email to verify your account, then sign in.");
        setMode("sign-in");
        return;
      }

      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL,
      });

      if (result.error) throw new Error(result.error.message);

      // Use a full navigation so the newly issued session cookie is applied
      // before the authenticated layout and home page are rendered.
      window.location.replace(callbackURL);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to complete that request.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.authCard}>
      <div className={styles.authHeading}>
        <p className="eyebrow">YOUR FOOD ACCOUNT</p>
        <h1>
          {mode === "sign-up"
            ? "Create your account"
            : mode === "forgot"
              ? "Reset your password"
              : "Welcome back"}
        </h1>
        <p>
          {mode === "sign-up"
            ? "Save favourite recipes across your devices and join a household."
            : mode === "forgot"
              ? "Enter your email and we’ll send a secure reset link."
              : "Sign in to open your Food home page."}
        </p>
      </div>

      <form className={styles.authForm} onSubmit={submit}>
        {mode === "sign-up" ? (
          <label>
            <span>Name</span>
            <input
              autoComplete="name"
              maxLength={80}
              minLength={2}
              name="name"
              required
              type="text"
            />
          </label>
        ) : null}

        <label>
          <span>Email address</span>
          <input autoComplete="email" name="email" required type="email" />
        </label>

        {mode !== "forgot" ? (
          <label>
            <span>Password</span>
            <input
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              minLength={12}
              name="password"
              required
              type="password"
            />
            {mode === "sign-up" ? <small>At least 12 characters.</small> : null}
          </label>
        ) : null}

        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {message ? <p className={styles.success} role="status">{message}</p> : null}

        <button className={styles.primaryButton} disabled={pending} type="submit">
          {pending
            ? "Please wait…"
            : mode === "sign-up"
              ? "Create account"
              : mode === "forgot"
                ? "Send reset link"
                : "Sign in"}
        </button>
      </form>

      <div className={styles.authActions}>
        {mode === "sign-in" ? (
          <>
            <button onClick={() => setMode("sign-up")} type="button">Create an account</button>
            <button onClick={() => setMode("forgot")} type="button">Forgot password?</button>
          </>
        ) : (
          <button onClick={() => setMode("sign-in")} type="button">Back to sign in</button>
        )}
        <Link href="/recipes">Continue without signing in</Link>
      </div>
    </div>
  );
}
