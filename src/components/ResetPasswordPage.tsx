"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase/client";
import { trackEvent } from "@/lib/analytics-client";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode") ?? "";
  const mode = searchParams.get("mode") ?? "";

  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isFirebaseClientConfigured()) {
      setError("Authentication is not configured yet.");
      setVerifying(false);
      return;
    }
    if (mode && mode !== "resetPassword") {
      setError("This link is not valid for password reset.");
      setVerifying(false);
      return;
    }
    if (!oobCode) {
      setError("Missing or invalid reset link. Request a new one from the sign-in screen.");
      setVerifying(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const auth = getFirebaseAuth();
        const accountEmail = await verifyPasswordResetCode(auth, oobCode);
        if (!cancelled) setEmail(accountEmail);
      } catch {
        if (!cancelled) {
          setError(
            "This reset link has expired or was already used. Request a new password reset from the sign-in screen."
          );
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      await confirmPasswordReset(auth, oobCode, password);
      await trackEvent("password_reset_complete", {
        properties: { email: email ?? undefined },
      });
      setDone(true);
    } catch {
      setError(
        "Could not reset your password. The link may have expired — request a new reset email."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-inner admin-login-wrap">
        <div className="admin-login-card">
          <div className="admin-login-mark">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>

          {verifying ? (
            <>
              <h1>Verifying link…</h1>
              <p className="admin-muted">Please wait while we validate your reset link.</p>
            </>
          ) : done ? (
            <>
              <h1>Password updated</h1>
              <p>
                Your password has been reset{email ? ` for ${email}` : ""}. You can sign in with
                your new password.
              </p>
              <Link href="/?login=1" className="btn-p full-btn" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
                Sign in
              </Link>
            </>
          ) : error && !email ? (
            <>
              <h1>Reset link invalid</h1>
              <p>{error}</p>
              <Link href="/?login=1" className="btn-o full-btn" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h1>Choose a new password</h1>
              <p>
                {email ? (
                  <>
                    Set a new password for <strong>{email}</strong>.
                  </>
                ) : (
                  "Enter your new password below."
                )}
              </p>
              {error && <div className="m-error show">{error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label>New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                </div>
                <div className="field">
                  <label>Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                </div>
                <button type="submit" className="btn-p full-btn" disabled={busy}>
                  {busy ? "Updating…" : "Update password"}
                </button>
              </form>
              <div className="m-foot">
                <Link href="/">← Back to home</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-page">
          <div className="admin-inner admin-login-wrap">
            <p className="empty">Loading…</p>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
