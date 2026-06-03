"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthModal, { type DemoProfile } from "@/components/AuthModal";
import PreviewReel from "@/components/PreviewReel";
import { MEMBER_DEMO_URL, AGENT_DEMO_URL } from "@/lib/constants";
import { trackEvent } from "@/lib/analytics-client";

type DemoKey = "member" | "agent";

export default function LandingPage() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<DemoProfile | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authView, setAuthView] = useState<"login" | "register">("register");
  const [pendingDemo, setPendingDemo] = useState<DemoKey | null>(null);
  const [reelOpen, setReelOpen] = useState(false);
  const [reelKey, setReelKey] = useState<DemoKey | null>(null);

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

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (searchParams.get("login") === "1") {
      setAuthView("login");
      setAuthOpen(true);
    }
  }, [searchParams]);

  const openAuth = (view: "login" | "register") => {
    setAuthView(view);
    setAuthOpen(true);
  };

  const launchDemo = async (which: DemoKey) => {
    if (!profile) {
      setPendingDemo(which);
      openAuth("register");
      return;
    }
    const url = which === "member" ? MEMBER_DEMO_URL : AGENT_DEMO_URL;
    await trackEvent("demo_launch", {
      properties: { demo: which, url },
    });
    window.open(url, "_blank");
  };

  const onAuthed = async (p: DemoProfile) => {
    setProfile(p);
    await refreshSession();
    const returnUrl = searchParams.get("return");
    if (returnUrl) {
      try {
        const u = new URL(returnUrl);
        if (u.hostname.endsWith("cercalabs.com")) {
          window.location.href = returnUrl;
          return;
        }
      } catch {
        /* ignore invalid return */
      }
    }
    if (pendingDemo) {
      const d = pendingDemo;
      setPendingDemo(null);
      launchDemo(d);
    } else {
      document.getElementById("demos")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const signOut = async () => {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    setProfile(null);
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
            <button type="button" className="btn-g" onClick={ctaDemos}>
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
                  >
                    Watch preview
                  </button>
                  <button
                    type="button"
                    className={`btn-p${loggedIn ? "" : " demo-locked-btn"}`}
                    onClick={() => launchDemo("member")}
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
                  >
                    Watch preview
                  </button>
                  <button
                    type="button"
                    className={`btn-p${loggedIn ? "" : " demo-locked-btn"}`}
                    onClick={() => launchDemo("agent")}
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
            <button type="button" className="btn-g" onClick={ctaDemos}>
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
