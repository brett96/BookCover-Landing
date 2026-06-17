"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase/client";
import { trackEvent } from "@/lib/analytics-client";

export type DemoProfile = {
  first: string;
  last: string;
  email: string;
  biz: string;
};

type View = "login" | "register" | "forgotPassword" | "2faCode" | "success";

export type AuthView = "login" | "register" | "forgotPassword";

type LoadingKind = "register" | "login" | "verify" | "resend" | "reset";

type Props = {
  open: boolean;
  initialView: AuthView;
  redirectAfterAuth?: string | null;
  onClose: () => void;
  onAuthed: (profile: DemoProfile) => void;
};

const LOADING_COPY: Record<
  LoadingKind,
  { title: string; sub: string }
> = {
  register: {
    title: "Creating your account…",
    sub: "Setting up your profile and sending a verification code to your email.",
  },
  login: {
    title: "Signing you in…",
    sub: "Checking your credentials and sending a verification code to your email.",
  },
  verify: {
    title: "Verifying your code…",
    sub: "Unlocking demo access — just a moment.",
  },
  resend: {
    title: "Sending a new code…",
    sub: "Check your inbox for another 6-digit verification code.",
  },
  reset: {
    title: "Sending reset link…",
    sub: "Check your inbox for a link to choose a new password.",
  },
};

function maskEmail(e: string): string {
  const p = e.split("@");
  if (p.length < 2) return e;
  const n = p[0];
  return `${n.length <= 2 ? n[0] + "*" : n.slice(0, 2) + "***"}@${p[1]}`;
}

function AuthLoadingPanel({ kind }: { kind: LoadingKind }) {
  const copy = LOADING_COPY[kind];
  return (
    <div className="auth-loading-panel" role="status" aria-live="polite">
      <div className="auth-spinner" aria-hidden="true" />
      <div className="auth-loading-title">{copy.title}</div>
      <div className="auth-loading-sub">{copy.sub}</div>
    </div>
  );
}

export default function AuthModal({
  open,
  initialView,
  redirectAfterAuth,
  onClose,
  onAuthed,
}: Props) {
  const [view, setView] = useState<View>(initialView);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingKind, setLoadingKind] = useState<LoadingKind>("login");
  const [idToken, setIdToken] = useState<string | null>(null);
  const [pendingProfile, setPendingProfile] = useState<DemoProfile | null>(null);
  const [masked, setMasked] = useState("");
  const [resetSentTo, setResetSentTo] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (open) {
      setView(initialView);
      setError("");
      setBusy(false);
      setResetSentTo("");
      setForgotEmail("");
    }
  }, [open, initialView]);

  const clearError = () => setError("");

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const afterFirebaseAuth = useCallback(
    async (token: string, profile: DemoProfile, isNew: boolean) => {
      setIdToken(token);
      setPendingProfile(profile);
      setMasked(maskEmail(profile.email));
      if (isNew) {
        await fetch("/api/auth/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...profile,
            phone: (document.getElementById("regPhone") as HTMLInputElement)
              ?.value,
            company: (document.getElementById("regCompany") as HTMLInputElement)
              ?.value,
            title: (document.getElementById("regTitle") as HTMLInputElement)
              ?.value,
            createdAt: Date.now(),
          }),
        });
        await trackEvent("registration", { properties: { email: profile.email } });
      }
      const otpRes = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken: token }),
      });
      if (!otpRes.ok) {
        const j = await otpRes.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not send verification code");
      }
      setView("2faCode");
    },
    []
  );

  const doRegister = async () => {
    clearError();
    if (!isFirebaseClientConfigured()) {
      setError("Authentication is not configured yet.");
      return;
    }
    const first = val("regFirst");
    const last = val("regLast");
    const email = val("regEmail").toLowerCase();
    const phone = val("regPhone");
    const company = val("regCompany");
    const biz = val("regBizType");
    const pass = val("regPass");
    const consent = (document.getElementById("regConsent") as HTMLInputElement)
      ?.checked;
    if (!first || !last || !email || !phone || !company || !biz || !pass) {
      setError("Please complete all required fields.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (pass.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!consent) {
      setError("Please accept the access & contact notice to continue.");
      return;
    }
    setLoadingKind("register");
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        pass
      );
      const token = await cred.user.getIdToken();
      await afterFirebaseAuth(
        token,
        { first, last, email, biz },
        true
      );
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "code" in e && e.code === "auth/email-already-in-use"
          ? "That email is already registered. Try signing in."
          : e instanceof Error
            ? e.message
            : "Registration failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const doLogin = async () => {
    clearError();
    if (!isFirebaseClientConfigured()) {
      setError("Authentication is not configured yet.");
      return;
    }
    const email = val("loginEmail").toLowerCase();
    const pass = val("loginPass");
    if (!email || !pass) {
      setError("Enter your email and password.");
      return;
    }
    setLoadingKind("login");
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        pass
      );
      const token = await cred.user.getIdToken();
      const sessionRes = await fetch("/api/auth/session", {
        credentials: "include",
      });
      const session = await sessionRes.json();
      const p = session.profile as Record<string, string> | null;
      await afterFirebaseAuth(
        token,
        {
          first: p?.first ?? "Member",
          last: p?.last ?? "",
          email,
          biz: p?.biz ?? "",
        },
        false
      );
    } catch {
      setError(
        "We couldn't find a matching account. Check your details or register."
      );
    } finally {
      setBusy(false);
    }
  };

  const doForgotPassword = async () => {
    clearError();
    const email = forgotEmail.trim().toLowerCase();
    if (!email) {
      setError("Enter the email address for your account.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoadingKind("reset");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Could not send reset email."
        );
      }
      await trackEvent("password_reset_request", { properties: { email } });
      setResetSentTo(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    clearError();
    const code = codeRefs.current.map((i) => i?.value ?? "").join("");
    if (code.length !== 6) {
      setError("Enter the full 6-digit code.");
      return;
    }
    setLoadingKind("verify");
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      let token = idToken;
      if (auth.currentUser) {
        token = await auth.currentUser.getIdToken(true);
      }
      if (!token) {
        setError("Session expired. Please sign in again.");
        return;
      }
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken: token, code }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Verification failed");
      const p = (j.profile ?? {}) as Record<string, string>;
      const verifiedProfile: DemoProfile = {
        first: p.first ?? pendingProfile?.first ?? "Member",
        last: p.last ?? pendingProfile?.last ?? "",
        email: j.email ?? pendingProfile?.email ?? "",
        biz: p.biz ?? pendingProfile?.biz ?? "",
      };
      setPendingProfile(verifiedProfile);
      if (redirectAfterAuth) {
        onAuthed(verifiedProfile);
        return;
      }
      setView("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    clearError();
    setLoadingKind("resend");
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      let token = idToken;
      if (auth.currentUser) {
        token = await auth.currentUser.getIdToken(true);
      }
      if (!token) {
        setError("Session expired. Please sign in again.");
        return;
      }
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken: token }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not resend code");
      }
      codeRefs.current.forEach((input) => {
        if (input) input.value = "";
      });
      codeRefs.current[0]?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend code");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (pendingProfile) onAuthed(pendingProfile);
    onClose();
  };

  if (!open) return null;

  const title =
    view === "register"
      ? "Create Account"
      : view === "login"
        ? "Sign In"
        : view === "forgotPassword"
          ? "Reset Password"
          : "Secure Verification";

  return (
    <div
      className={`overlay${open ? " show" : ""}`}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="modal">
        <div className="modal-head">
          <div className="mh-left">
            <div className="mh-mark">
              <svg viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <div className="mh-title">{title}</div>
              <div className="mh-sub">Secure demo access portal</div>
            </div>
          </div>
          <button
            type="button"
            className="mh-close"
            onClick={handleClose}
            disabled={busy}
            aria-disabled={busy}
          >
            &times;
          </button>
        </div>
        <div className="modal-body">
          {view === "login" && (
            <div className="mview show">
              {busy ? (
                <AuthLoadingPanel kind={loadingKind} />
              ) : (
                <>
                  <div className="m-h">Welcome back</div>
                  <div className="m-p">Sign in to access the BookCover demos.</div>
                  {error && <div className="m-error show">{error}</div>}
                  <div className="field">
                    <label>Email address</label>
                    <input type="email" id="loginEmail" placeholder="you@company.com" />
                  </div>
                  <div className="field">
                    <label>Password</label>
                    <input type="password" id="loginPass" placeholder="Your password" />
                  </div>
                  <button type="button" className="btn-p full-btn" onClick={doLogin}>
                    Continue
                  </button>
                  <div className="m-foot">
                    <a
                      onClick={() => {
                        clearError();
                        setResetSentTo("");
                        setForgotEmail(val("loginEmail"));
                        setView("forgotPassword");
                      }}
                    >
                      Forgot password?
                    </a>
                    {" · "}
                    New here?{" "}
                    <a
                      onClick={() => {
                        clearError();
                        setView("register");
                      }}
                    >
                      Create an account
                    </a>
                  </div>
                </>
              )}
            </div>
          )}

          {view === "register" && (
            <div className="mview show">
              {busy ? (
                <AuthLoadingPanel kind={loadingKind} />
              ) : (
                <>
                  <div className="m-h">Create your account</div>
                  <div className="m-p">
                    Tell us a little about you and your business. Demo access is limited to
                    registered users.
                  </div>
                  {error && <div className="m-error show">{error}</div>}
                  <div className="field half">
                    <label>
                      First name <span className="req">*</span>
                    </label>
                    <input type="text" id="regFirst" placeholder="Jane" />
                  </div>
                  <div className="field half">
                    <label>
                      Last name <span className="req">*</span>
                    </label>
                    <input type="text" id="regLast" placeholder="Doe" />
                  </div>
                  <div className="field">
                    <label>
                      Work email <span className="req">*</span>
                    </label>
                    <input type="email" id="regEmail" placeholder="jane@company.com" />
                  </div>
                  <div className="field">
                    <label>
                      Mobile phone <span className="req">*</span>
                    </label>
                    <input type="tel" id="regPhone" placeholder="(555) 123-4567" />
                  </div>
                  <div className="field">
                    <label>
                      Company / Organization <span className="req">*</span>
                    </label>
                    <input type="text" id="regCompany" placeholder="Acme Health" />
                  </div>
                  <div className="field">
                    <label>Job title</label>
                    <input type="text" id="regTitle" placeholder="Director of Retention" />
                  </div>
                  <div className="field">
                    <label>
                      Which best describes your business? <span className="req">*</span>
                    </label>
                    <select id="regBizType" defaultValue="">
                      <option value="">Select one…</option>
                      <option value="Carrier">Carrier / Health Plan</option>
                      <option value="FMO">FMO (Field Marketing Organization)</option>
                      <option value="Independent Agent">Independent Agent</option>
                      <option value="Consultant">Consultant</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>
                      Create a password <span className="req">*</span>
                    </label>
                    <input type="password" id="regPass" placeholder="At least 6 characters" />
                  </div>
                  <div className="consent">
                    <input type="checkbox" id="regConsent" />
                    <label
                      style={{
                        fontWeight: 400,
                        fontSize: 12,
                        color: "var(--slate)",
                        margin: 0,
                      }}
                    >
                      I agree that my access to the BookCover demos may be recorded, and I
                      consent to being contacted about BookCover.
                    </label>
                  </div>
                  <button type="button" className="btn-p full-btn" onClick={doRegister}>
                    Create Account &amp; Verify
                  </button>
                  <div className="m-foot">
                    Already registered?{" "}
                    <a
                      onClick={() => {
                        clearError();
                        setView("login");
                      }}
                    >
                      Sign in
                    </a>
                  </div>
                </>
              )}
            </div>
          )}

          {view === "forgotPassword" && (
            <div className="mview show">
              {busy ? (
                <AuthLoadingPanel kind={loadingKind} />
              ) : resetSentTo ? (
                <>
                  <div className="m-h">Check your email</div>
                  <div className="m-p">
                    If an account exists for <strong>{maskEmail(resetSentTo)}</strong>, we sent a
                    link to reset your password. The link expires after a short time.
                  </div>
                  <button
                    type="button"
                    className="btn-p full-btn"
                    onClick={() => {
                      setResetSentTo("");
                      setView("login");
                    }}
                  >
                    Back to sign in
                  </button>
                </>
              ) : (
                <>
                  <div className="m-h">Reset your password</div>
                  <div className="m-p">
                    Enter your account email and we&apos;ll send a link to choose a new password.
                  </div>
                  {error && <div className="m-error show">{error}</div>}
                  <div className="field">
                    <label>Email address</label>
                    <input
                      type="email"
                      id="forgotEmail"
                      placeholder="you@company.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                  </div>
                  <button type="button" className="btn-p full-btn" onClick={doForgotPassword}>
                    Send reset link
                  </button>
                  <div className="m-foot">
                    <a
                      onClick={() => {
                        clearError();
                        setView("login");
                      }}
                    >
                      Back to sign in
                    </a>
                  </div>
                </>
              )}
            </div>
          )}

          {view === "2faCode" && (
            <div className="mview show">
              {busy ? (
                <AuthLoadingPanel kind={loadingKind} />
              ) : (
                <>
                  <div className="m-h">Enter your code</div>
                  <div className="m-p">
                    We sent a 6-digit code to <strong>{masked}</strong>.
                  </div>
                  {error && <div className="m-error show">{error}</div>}
                  <div className="code-inputs">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          codeRefs.current[i] = el;
                        }}
                        className="code-box"
                        maxLength={1}
                        inputMode="numeric"
                        onKeyUp={(e) => {
                          const t = e.target as HTMLInputElement;
                          if (t.value && i < 5) codeRefs.current[i + 1]?.focus();
                        }}
                      />
                    ))}
                  </div>
                  <button type="button" className="btn-p full-btn" onClick={verifyCode}>
                    Verify &amp; Unlock Demos
                  </button>
                  <div className="m-foot">
                    <a onClick={resendCode}>Resend code</a>
                  </div>
                </>
              )}
            </div>
          )}

          {view === "success" && (
            <div className="mview show">
              <div className="success-wrap">
                <div className="success-ring">
                  <svg viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="m-h">You&apos;re verified</div>
                <div className="m-p">
                  Welcome, {pendingProfile?.first}. Both demos are now unlocked.
                </div>
                <button type="button" className="btn-p full-btn" onClick={finish}>
                  Go to the Demos
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function val(id: string): string {
  return (
    (document.getElementById(id) as HTMLInputElement | HTMLSelectElement)?.value ??
    ""
  ).trim();
}
