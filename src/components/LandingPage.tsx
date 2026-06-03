"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthModal, { type DemoProfile } from "@/components/AuthModal";
import PreviewReel from "@/components/PreviewReel";
import {
  MEMBER_DEMO_URL,
  AGENT_DEMO_URL,
  resolveDemoReturn,
} from "@/lib/constants";
import {
  clearGateRetry,
  demoLaunchUrl,
  fetchHandoffToken,
  markGateRetry,
  shouldAbortGateRetry,
} from "@/lib/demo-launch";
import { trackEvent } from "@/lib/analytics-client";

type DemoKey = "member" | "agent";

const LAUNCH_COPY: Record<DemoKey, { title: string; sub: string }> = {
  member: {
    title: "Opening Member Experience…",
    sub: "Securing your demo access and loading the member app.",
  },
  agent: {
    title: "Opening Agent Portal…",
    sub: "Securing your demo access and loading the retention workspace.",
  },
};

function clearAuthQueryParams() {
  const url = new URL(window.location.href);
  if (
    !url.searchParams.has("login") &&
    !url.searchParams.has("return") &&
    !url.searchParams.has("gate_bounce")
  ) {
    return;
  }
  url.searchParams.delete("login");
  url.searchParams.delete("return");
  url.searchParams.delete("gate_bounce");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

function demoUrlFor(which: DemoKey): string {
  return which === "member" ? MEMBER_DEMO_URL : AGENT_DEMO_URL;
}

function LaunchOverlay({ which }: { which: DemoKey }) {
  const copy = LAUNCH_COPY[which];
  return (
    <div className="launch-overlay" role="status" aria-live="polite">
      <div className="auth-loading-panel">
        <div className="auth-spinner" aria-hidden="true" />
        <div className="auth-loading-title">{copy.title}</div>
        <div className="auth-loading-sub">{copy.sub}</div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const searchParams = useSearchParams();
  const returnTarget = useMemo(
    () => resolveDemoReturn(searchParams.get("return")),
    [searchParams]
  );
  const [profile, setProfile] = useState<DemoProfile | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authView, setAuthView] = useState<"login" | "register">("register");
  const [pendingDemo, setPendingDemo] = useState<DemoKey | null>(null);
  const [reelOpen, setReelOpen] = useState(false);
  const [reelKey, setReelKey] = useState<DemoKey | null>(null);
  const [launching, setLaunching] = useState<DemoKey | null>(null);
  const [launchError, setLaunchError] = useState("");

  const loggedIn = !!profile;

  const refreshSession = useCallback(async (): Promise<DemoProfile | null> => {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    const data = await res.json();
    if (!data.authenticated) {
      setProfile(null);
      return null;
    }
    const p = (data.profile ?? {}) as Record<string, string>;
    const next: DemoProfile = {
      first: p.first ?? data.email?.split("@")[0] ?? "Member",
      last: p.last ?? "",
      email: data.email ?? p.email ?? "",
      biz: p.biz ?? "",
    };
    setProfile(next);
    return next;
  }, []);

  const goToDemo = useCallback(async (url: string): Promise<boolean> => {
    const token = await fetchHandoffToken();
    if (!token) return false;
    window.location.assign(demoLaunchUrl(url, token));
    return true;
  }, []);

  const openLaunchFailure = useCallback((which: DemoKey) => {
    setLaunchError(
      "We couldn't open the demo. Sign in again to refresh your access, and confirm DEMO_JWT_SECRET matches on landing and the demo project."
    );
    setPendingDemo(which);
    setAuthView("login");
    setAuthOpen(true);
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const wantsLogin = searchParams.get("login") === "1";
      const hasReturn = Boolean(searchParams.get("return"));
      if (!wantsLogin && !hasReturn) return;

      const existing = await refreshSession();
      if (cancelled) return;

      if (existing && returnTarget) {
        const bounced = searchParams.get("gate_bounce") === "1";
        clearAuthQueryParams();

        if (bounced && shouldAbortGateRetry()) {
          openLaunchFailure(returnTarget.which);
          return;
        }
        if (bounced) markGateRetry();

        setLaunching(returnTarget.which);
        const ok = await goToDemo(returnTarget.url);
        if (cancelled) return;
        if (!ok) {
          setLaunching(null);
          openLaunchFailure(returnTarget.which);
        }
        return;
      }

      if (existing) {
        clearAuthQueryParams();
        clearGateRetry();
        return;
      }

      if (wantsLogin) {
        setAuthView("login");
        setAuthOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, refreshSession, returnTarget, goToDemo, openLaunchFailure]);

  const openAuth = (view: "login" | "register") => {
    setLaunchError("");
    setAuthView(view);
    setAuthOpen(true);
  };

  const launchDemo = async (which: DemoKey) => {
    setLaunchError("");
    clearGateRetry();

    let activeProfile = profile;
    if (!activeProfile) {
      activeProfile = await refreshSession();
    }
    if (!activeProfile) {
      setPendingDemo(which);
      openAuth("register");
      return;
    }

    setLaunching(which);
    try {
      const url = demoUrlFor(which);
      await trackEvent("demo_launch", {
        properties: { demo: which, url },
      });
      const ok = await goToDemo(url);
      if (!ok) {
        setLaunching(null);
        openLaunchFailure(which);
      }
    } catch {
      setLaunching(null);
      openLaunchFailure(which);
    }
  };

  const onAuthed = async (p: DemoProfile) => {
    setProfile(p);
    await refreshSession();
    clearAuthQueryParams();
    clearGateRetry();

    if (returnTarget) {
      setLaunching(returnTarget.which);
      const ok = await goToDemo(returnTarget.url);
      if (!ok) {
        setLaunching(null);
        setAuthOpen(true);
      }
      return;
    }
    if (pendingDemo) {
      const d = pendingDemo;
      setPendingDemo(null);
      await launchDemo(d);
    } else {
      setAuthOpen(false);
      document.getElementById("demos")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const signOut = async () => {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    setProfile(null);
    clearGateRetry();
  };

  const ctaDemos = () => {
    if (loggedIn) {
      document.getElementById("demos")?.scrollIntoView({ behavior: "smooth" });
    } else {
      openAuth("register");
    }
  };

  const lockIcon = loggedIn ? (
    <>
      <svg viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
      Unlocked
    </>
  ) : (
    <>
      <svg viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Registered users
    </>
  );

  return (
    <>
      {launching && <LaunchOverlay which={launching} />}

      <nav>
        <a href="#" className="nav-logo" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }); }}>
          <div className="nav-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <div className="nav-name">BookCover</div>
            <div className="nav-sub">Protecting your book of business</div>
          </div>
        </a>
        <div className="nav-right">
          <a className="nav-link" href="https://www.cercalabs.com/contact" target="_blank" rel="noopener">
            Contact Us
          </a>
          {!loggedIn ? (
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <button type="button" className="nav-link" onClick={() => openAuth("login")}>
                Sign In
              </button>
              <button type="button" className="nav-cta" onClick={() => openAuth("register")}>
                Access the Demos
              </button>
            </div>
          ) : (
            <div className="nav-user show">
              <div style={{ textAlign: "right" }}>
                <div className="nav-uname">
                  {profile.first} {profile.last}
                </div>
                <div className="nav-urole">{profile.biz}</div>
              </div>
              <div className="nav-avatar">{(profile.first[0] ?? "M").toUpperCase()}</div>
              <button type="button" className="nav-link" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      <section className="hero">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="hero-badge">
            <span className="badge-dot" />
            <span>Live Interactive Demo · Carriers &amp; Independent Agents</span>
          </div>
          <h1>
            Your book of business
            <br />
            is worth <span className="gold">protecting.</span>
          </h1>
          <p className="hero-sub">
            BookCover gives carriers and independent insurance agents the same advantage:
            AI-powered, real-time member relationships that drive retention — at a scale no
            team could reach by hand. Step inside the live demos to see exactly how it works.
          </p>
          <div className="hero-btns">
            <button type="button" className="btn-g" onClick={ctaDemos} disabled={!!launching}>
              <svg viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Launch the Live Demos
            </button>
            <button
              type="button"
              className="btn-o lighten"
              onClick={() => document.getElementById("value")?.scrollIntoView({ behavior: "smooth" })}
            >
              Why BookCover
            </button>
          </div>
          <div className="hero-note">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Demo access is limited to registered users · secured with email verification
          </div>
        </div>
        <div className="hero-card">
          <div className="hc-label">Two demos, one portal</div>
          <div className="hc-item">
            <div className="hc-ico">
              <svg viewBox="0 0 24 24">
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>
            <div>
              <div className="hc-t">Member Experience</div>
              <div className="hc-d">
                The white-labeled member app — magic-link onboarding, AI plan assistant, and
                Stay/Switch analysis.
              </div>
            </div>
          </div>
          <div className="hc-item">
            <div className="hc-ico">
              <svg viewBox="0 0 24 24">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <div className="hc-t">Agent / Retention Portal</div>
              <div className="hc-d">
                The retention-team workspace — risk scores, next-best-action queues, and
                campaign management.
              </div>
            </div>
          </div>
          <div className="hc-item">
            <div className="hc-ico">
              <svg viewBox="0 0 24 24">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <div className="hc-t">Under 60 seconds to start</div>
              <div className="hc-d">
                Register once, verify with email, and both demos unlock instantly.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec white" id="value">
        <div className="inner">
          <div className="sec-head">
            <span className="eyebrow">Why Retention, Why Now</span>
            <h2>
              Three truths every carrier and agent <span className="ac">already knows</span>
            </h2>
            <p className="body-copy ctr">
              Retention isn&apos;t a soft metric — it&apos;s the foundation of your book of
              business. BookCover is built around three realities of the market today.
            </p>
          </div>
          <div className="pillars">
            <div className="pillar">
              <div className="pillar-n">01</div>
              <div className="pillar-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3>Retention is the whole game</h3>
              <p>
                Every renewed member or policyholder is revenue you already earned — protected.
              </p>
            </div>
            <div className="pillar">
              <div className="pillar-n">02</div>
              <div className="pillar-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M3 3v18h18" />
                  <path d="M19 9l-5 5-4-4-3 3" />
                </svg>
              </div>
              <h3>External forces are eroding it</h3>
              <p>
                Aggressive competition, shifting CMS regulations, and changing demographics pull
                at your book at once.
              </p>
            </div>
            <div className="pillar">
              <div className="pillar-n">03</div>
              <div className="pillar-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <h3>Relationships are the moat</h3>
              <p>
                BookCover lets you deliver meaningful interactions to every single member, at
                scale.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sage" id="demos">
        <div className="inner">
          <div className="sec-head">
            <span className="eyebrow">The Live Demos</span>
            <h2>
              See BookCover <span className="ac">in action</span>
            </h2>
            <p className="body-copy ctr">
              Two fully interactive demos sit behind a secure login. Register once and verify with
              email to unlock both.
            </p>
          </div>
          {launchError && (
            <div className="m-error show" style={{ maxWidth: 720, margin: "0 auto 20px" }}>
              {launchError}
            </div>
          )}
          <div className="demo-grid">
            <div className="demo-card">
              <div className="demo-top">
                <div className="demo-badge member">
                  <svg viewBox="0 0 24 24">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                  </svg>
                </div>
                <div>
                  <div className="demo-kicker">Demo One</div>
                  <div className="demo-title">Member Experience</div>
                </div>
              </div>
              <div className="demo-body">
                <p>
                  Walk through the member&apos;s journey — magic-link invitation, carrier
                  connection, AI plan assistant, and Stay/Switch analysis.
                </p>
              </div>
              <div className="demo-foot">
                <span className={`lock-pill${loggedIn ? " open" : ""}`}>{lockIcon}</span>
                <div className="demo-btns">
                  <button
                    type="button"
                    className="btn-o demo-preview"
                    onClick={() => {
                      setReelKey("member");
                      setReelOpen(true);
                    }}
                    disabled={!!launching}
                  >
                    Watch preview
                  </button>
                  <button
                    type="button"
                    className={`btn-p${loggedIn ? "" : " demo-locked-btn"}${launching === "member" ? " is-launching" : ""}`}
                    onClick={() => launchDemo("member")}
                    disabled={!!launching}
                    aria-busy={launching === "member"}
                  >
                    Launch
                  </button>
                </div>
              </div>
            </div>
            <div className="demo-card">
              <div className="demo-top">
                <div className="demo-badge agent">
                  <svg viewBox="0 0 24 24">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                  </svg>
                </div>
                <div>
                  <div className="demo-kicker">Demo Two</div>
                  <div className="demo-title">Agent / Retention Portal</div>
                </div>
              </div>
              <div className="demo-body">
                <p>
                  Step into the retention team&apos;s workspace — risk scores, outreach queues,
                  and campaigns end-to-end.
                </p>
              </div>
              <div className="demo-foot">
                <span className={`lock-pill${loggedIn ? " open" : ""}`}>{lockIcon}</span>
                <div className="demo-btns">
                  <button
                    type="button"
                    className="btn-o demo-preview"
                    onClick={() => {
                      setReelKey("agent");
                      setReelOpen(true);
                    }}
                    disabled={!!launching}
                  >
                    Watch preview
                  </button>
                  <button
                    type="button"
                    className={`btn-p${loggedIn ? "" : " demo-locked-btn"}${launching === "agent" ? " is-launching" : ""}`}
                    onClick={() => launchDemo("agent")}
                    disabled={!!launching}
                    aria-busy={launching === "agent"}
                  >
                    Launch
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-split">
          <div className="cta-col">
            <h3 className="white" style={{ fontSize: 22 }}>
              Want to explore on your own?
            </h3>
            <p>Register, verify with a one-time email code, and walk through both demos.</p>
            <button type="button" className="btn-g" onClick={ctaDemos} disabled={!!launching}>
              Launch the Live Demos
            </button>
          </div>
        </div>
      </section>

      <footer>
        <div className="foot-inner">
          <div>
            <div className="foot-logo">
              <div className="nav-mark" style={{ width: 30, height: 30 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="foot-name">BookCover</div>
            </div>
            <div className="foot-comp" style={{ marginTop: 8 }}>
              A <b>CercaLabs</b> product · Protecting your book of business
            </div>
          </div>
          <div className="foot-comp" style={{ textAlign: "right" }}>
            <div>Demo access is restricted and logged for every registered user.</div>
          </div>
        </div>
      </footer>

      <AuthModal
        open={authOpen}
        initialView={authView}
        redirectAfterAuth={returnTarget?.url ?? null}
        onClose={() => setAuthOpen(false)}
        onAuthed={onAuthed}
      />
      <PreviewReel
        open={reelOpen}
        which={reelKey}
        onClose={() => setReelOpen(false)}
        onLaunch={launchDemo}
      />
    </>
  );
}
