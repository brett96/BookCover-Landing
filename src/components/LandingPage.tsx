"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthModal, { type DemoProfile, type AuthView } from "@/components/AuthModal";
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
    !url.searchParams.has("forgot") &&
    !url.searchParams.has("return") &&
    !url.searchParams.has("gate_bounce") &&
    !url.searchParams.has("handoff_failed") &&
    !url.searchParams.has("demo")
  ) {
    return;
  }
  url.searchParams.delete("login");
  url.searchParams.delete("forgot");
  url.searchParams.delete("return");
  url.searchParams.delete("gate_bounce");
  url.searchParams.delete("handoff_failed");
  url.searchParams.delete("demo");
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
  const [authView, setAuthView] = useState<AuthView>("register");
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

  const openLaunchFailure = useCallback(
    (which: DemoKey, signedIn: boolean) => {
      setLaunching(null);
      setLaunchError(
        signedIn
          ? "The demo could not verify your access token. Sign out, sign in again with email verification, then try Launch. If this persists, confirm DEMO_JWT_SECRET is identical on landing and the demo Vercel project (no extra spaces)."
          : "We couldn't open the demo. Sign in and complete email verification, then try again."
      );
      if (!signedIn) {
        setPendingDemo(which);
        setAuthView("login");
        setAuthOpen(true);
      }
    },
    []
  );

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Browser back from handoff/demo restores this page from bfcache with launching still set.
  useEffect(() => {
    const onPageShow = () => {
      setLaunching(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (searchParams.get("handoff_failed") === "1") {
        const which =
          searchParams.get("demo") === "agent" ? "agent" : "member";
        clearAuthQueryParams();
        const existing = await refreshSession();
        if (!cancelled) {
          openLaunchFailure(which, !!existing);
        }
        return;
      }

      const wantsLogin = searchParams.get("login") === "1";
      const wantsForgot = searchParams.get("forgot") === "1";
      const hasReturn = Boolean(searchParams.get("return"));
      if (!wantsLogin && !hasReturn && !wantsForgot) return;

      const existing = await refreshSession();
      if (cancelled) return;

      if (wantsForgot && !existing) {
        clearAuthQueryParams();
        setAuthView("forgotPassword");
        setAuthOpen(true);
        return;
      }

      if (existing && returnTarget) {
        const bounced = searchParams.get("gate_bounce") === "1";
        clearAuthQueryParams();

        if (bounced && shouldAbortGateRetry()) {
          openLaunchFailure(returnTarget.which, true);
          return;
        }
        if (bounced) markGateRetry();

        setLaunching(returnTarget.which);
        const ok = await goToDemo(returnTarget.url);
        if (cancelled) return;
        if (!ok) {
          openLaunchFailure(returnTarget.which, true);
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

  const openAuth = (view: AuthView) => {
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
        openLaunchFailure(which, true);
      }
    } catch {
      openLaunchFailure(which, !!profile);
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
      if (!ok) openLaunchFailure(returnTarget.which, true);
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

  const scrollToDemos = () => {
    document.getElementById("demos")?.scrollIntoView({ behavior: "smooth" });
  };

  const ctaDemos = () => {
    if (loggedIn) {
      scrollToDemos();
    } else {
      openAuth("register");
    }
  };

  const playIcon = (size?: number) => (
    <svg
      width={size ?? undefined}
      height={size ?? undefined}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size ? 2.2 : undefined}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );

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
          <a className="nav-link" href="/contact">
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
            <span>Live Interactive Demo · For Health Plans</span>
          </div>
          <h1>
            Your book of business
            <br />
            is worth <span className="gold">protecting.</span>
          </h1>
          <p className="hero-sub">
            BookCover protects retention for health plans with three components working as one:
            an embedded consulting team, white-labeled member tools, and an AI-powered retention
            portal. Step inside the live demos to see two of them in action.
          </p>
          <div className="hero-btns">
            <button type="button" className="btn-g" onClick={ctaDemos} disabled={!!launching}>
              {playIcon()}
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
          <div className="hc-label">Three components, one solution</div>
          <div className="hc-item">
            <div className="hc-ico">
              <svg viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <div className="hc-t">Retention Consultants</div>
              <div className="hc-d">
                An embedded team that builds and runs your retention strategy with you — not a
                login and a goodbye.
              </div>
            </div>
          </div>
          <div className="hc-item">
            <div className="hc-ico">
              <svg viewBox="0 0 24 24">
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>
            <div>
              <div className="hc-t">Member Tools</div>
              <div className="hc-d">
                A white-labeled member app that drives satisfaction and unlocks member data
                through FHIR.
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
              <div className="hc-t">Agent Portal</div>
              <div className="hc-d">
                The retention workspace — risk scores, next-best-action recommendations, and
                campaigns.
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
              Three truths every health plan <span className="ac">already knows</span>
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
                Every renewed member is revenue you already earned — protected. Keeping a member
                costs a fraction of replacing one, and a stable book is what compounds quality
                bonuses, Star Ratings, and enterprise value year over year.
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
                Aggressive competition, shifting CMS regulations, the growing strength of FMOs,
                and changing member demographics are all pulling at your book at once. Doing
                nothing isn&apos;t holding steady — it&apos;s slow attrition.
              </p>
            </div>
            <div className="pillar">
              <div className="pillar-n">03</div>
              <div className="pillar-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Relationships are the moat</h3>
              <p>
                Members stay where they feel known. Meaningful, personal interactions are what
                differentiate you — and BookCover lets you deliver them to every single member,
                at a scale no team could reach by hand.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec mint">
        <div className="inner">
          <div className="sec-head">
            <span className="eyebrow">The Pressure on Your Book</span>
            <h2>
              What&apos;s pulling members <span className="ac">away from you</span>
            </h2>
            <p className="body-copy ctr">
              These forces bear down on every health plan. BookCover is designed to counter each
              one with relationship-driven engagement.
            </p>
          </div>
          <div className="forces-grid">
            <div className="force">
              <div className="force-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
                </svg>
              </div>
              <div className="force-t">Intensifying competition</div>
              <div className="force-d">
                More plans, more aggressive marketing, and lower switching friction make every
                member a target during open enrollment.
              </div>
            </div>
            <div className="force">
              <div className="force-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                  <line x1="9" y1="17" x2="13" y2="17" />
                </svg>
              </div>
              <div className="force-t">Shifting CMS regulation</div>
              <div className="force-d">
                Changing marketing rules, Star Ratings methodology, and compliance requirements
                reshape how you&apos;re allowed to reach members.
              </div>
            </div>
            <div className="force">
              <div className="force-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="force-t">Growing strength of FMOs</div>
              <div className="force-d">
                Consolidating field marketing organizations control more of the distribution
                relationship — and the member loyalty that comes with it.
              </div>
            </div>
            <div className="force">
              <div className="force-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div className="force-t">Changing demographics</div>
              <div className="force-d">
                Newly-eligible members expect digital-first, on-demand service — the annual phone
                call no longer earns loyalty.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec navy">
        <div className="inner">
          <div className="scale-row">
            <div>
              <span className="eyebrow light">Meaningful Results, At Scale</span>
              <h2 className="white">
                Personal relationships —
                <br />
                delivered to <span className="ac">every member</span>
              </h2>
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.8,
                  color: "rgba(255,255,255,.88)",
                  maxWidth: 520,
                  marginTop: 10,
                }}
              >
                A single agent can build real relationships with a few hundred members. BookCover
                uses AI to make every member feel personally known — surfacing the right outreach,
                at the right moment, in the agent&apos;s own voice. Meaningful interaction stops
                being a luxury and becomes your operating model.
              </p>
            </div>
            <div className="scale-visual">
              <div className="sv-line">
                <div className="sv-num">12×</div>
                <div className="sv-txt">
                  <b>More touchpoints</b>From one or two contacts a year to continuous,
                  personalized engagement.
                </div>
              </div>
              <div className="sv-line">
                <div className="sv-num">1:1</div>
                <div className="sv-txt">
                  <b>At the member level</b>Every interaction tailored to a member&apos;s real
                  plan, claims, and utilization.
                </div>
              </div>
              <div className="sv-line">
                <div className="sv-num">100%</div>
                <div className="sv-txt">
                  <b>Of your book covered</b>No member falls through the cracks — relationships
                  scale with the AI, not the headcount.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec white" id="solution">
        <div className="inner">
          <div className="sec-head">
            <span className="eyebrow">The BookCover Solution</span>
            <h2>
              Three components that <span className="ac">work as one</span>
            </h2>
            <p className="body-copy ctr">
              BookCover is more than software. It pairs an embedded consulting team with two
              purpose-built platforms — so retention isn&apos;t just a tool you&apos;re handed,
              it&apos;s a capability we build with you.
            </p>
          </div>
          <div className="comp-grid">
            <div className="comp-card lead">
              <div className="comp-flag">The differentiator</div>
              <div className="comp-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="comp-n">Component 01</div>
              <h3>Retention Consultants</h3>
              <p>
                We don&apos;t hand you logins and wish you luck. Our consultants become part of
                your retention and customer-service teams — learning your membership, building
                campaign strategies around your needs, and implementing the automation that fits
                your business.
              </p>
              <div className="comp-link gold">The team that puts the platforms to work ↓</div>
            </div>
            <div className="comp-card">
              <div className="comp-ico">
                <svg viewBox="0 0 24 24">
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </div>
              <div className="comp-n">Component 02</div>
              <h3>Member Tools</h3>
              <p>
                Self-service capabilities that improve member satisfaction — and the vehicle
                members use to grant permission to their data. A fully functioning, white-labeled
                tool creates real value and engagement on behalf of the health plan, surfaces
                insight into member behavior, and opens a direct channel that strengthens
                retention.
              </p>
              <button type="button" className="comp-link" onClick={scrollToDemos}>
                See the Member demo →
              </button>
            </div>
            <div className="comp-card">
              <div className="comp-ico">
                <svg viewBox="0 0 24 24">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div className="comp-n">Component 03</div>
              <h3>Agent Portal</h3>
              <p>
                The workspace that drives insights and retention campaigns. It&apos;s where your
                BookCover consultants and your retention / customer-service teams gain meaningful
                insight into membership — individual risk scores and next-best-action
                recommendations — and run the campaigns that keep members.
              </p>
              <button type="button" className="comp-link" onClick={scrollToDemos}>
                See the Agent demo →
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="sec navy" id="consulting">
        <div className="inner">
          <div className="sec-head" style={{ maxWidth: 760 }}>
            <span className="eyebrow light">Component 01 · In Depth</span>
            <h2 className="white">
              Your dedicated <span className="ac">retention consultant</span>
            </h2>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.8,
                color: "rgba(255,255,255,.88)",
                maxWidth: 680,
                margin: "0 auto",
              }}
            >
              Most vendors sell software and disappear. BookCover provides leadership <em>and</em>{" "}
              technology. No two health plans are alike, so we don&apos;t use one-size-fits-all
              playbooks — every strategy is built around your members, your benefit structure, and
              your goals. Because we&apos;re embedded in your team, your ideas become live
              campaigns in days, not quarters — and with decades in the Medicare and managed-care
              space, our team makes sure every one of them is built to be compliant from the start.
            </p>
          </div>
          <div className="cons-grid">
            <div className="cons-item">
              <div className="cons-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M3 3v18h18" />
                  <path d="M19 9l-5 5-4-4-3 3" />
                </svg>
              </div>
              <div className="cons-t">Retention strategy development</div>
              <div className="cons-d">
                We define your target segments, intervention triggers, campaign sequences, and
                success metrics — aligned to your business goals.
              </div>
            </div>
            <div className="cons-item">
              <div className="cons-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M4 4h16v12H5.17L4 17.17V4z" />
                  <line x1="8" y1="9" x2="16" y2="9" />
                  <line x1="8" y1="12" x2="13" y2="12" />
                </svg>
              </div>
              <div className="cons-t">Campaign design &amp; management</div>
              <div className="cons-d">
                Copy, segmentation, timing, A/B testing, and compliance review — built from
                scratch for your plan. You approve the strategy; we execute everything else.
              </div>
            </div>
            <div className="cons-item">
              <div className="cons-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div className="cons-t">Member insights &amp; quality reporting</div>
              <div className="cons-d">
                We translate engagement data into CAHPS, Star Rating, and quality-measure value
                — turning retention activity into regulatory and bottom-line impact.
              </div>
            </div>
            <div className="cons-item">
              <div className="cons-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                </svg>
              </div>
              <div className="cons-t">Embedded training &amp; implementation</div>
              <div className="cons-d">
                We onboard your coordinators, work cross-functionally with your clinical,
                marketing, and IT teams, and lead rollouts so your team is never left to manage
                it alone.
              </div>
            </div>
            <div className="cons-item">
              <div className="cons-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                  <line x1="9" y1="17" x2="13" y2="17" />
                </svg>
              </div>
              <div className="cons-t">Ongoing reporting &amp; pre-AEP briefings</div>
              <div className="cons-d">
                Weekly performance reports, executive retention dashboards, actionable insight
                memos, and a prioritized at-risk briefing ahead of every Annual Enrollment Period.
              </div>
            </div>
            <div className="cons-item highlight">
              <div className="cons-ico">
                <svg viewBox="0 0 24 24">
                  <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div className="cons-t">Ideas to live campaigns — in days</div>
              <div className="cons-d">
                When you have an idea, we operationalize it. When the data surfaces an
                opportunity, we act on it. That&apos;s what being embedded means.
              </div>
            </div>
          </div>
          <div className="cons-compliance">
            <div className="cc-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <div className="cc-t">Compliance is built in, not bolted on</div>
              <div className="cc-d">
                Our team has been in the Medicare and managed-care space for decades. Every idea
                we discuss and every automation we implement is designed with CMS and regulatory
                compliance at its core — so your retention programs can move fast without ever
                putting your plan at risk.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec white">
        <div className="inner">
          <div className="sec-head">
            <span className="eyebrow">Built for Health Plans</span>
            <h2>
              Operationalize retention across your <span className="ac">whole membership</span>
            </h2>
            <p className="body-copy ctr">
              Turn a fragmented annual touchpoint into a continuous, data-driven relationship —
              improving satisfaction, Star Ratings, and renewal across your membership.
            </p>
          </div>
          <div className="pillars">
            <div className="pillar">
              <div className="pillar-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Member-level engagement at scale</h3>
              <p>
                Continuous, personalized engagement that reaches every member, not just a sample
                — turning a once-a-year touchpoint into an ongoing relationship.
              </p>
            </div>
            <div className="pillar">
              <div className="pillar-ico">
                <svg viewBox="0 0 24 24">
                  <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
                  <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
                </svg>
              </div>
              <h3>FHIR-powered personalization</h3>
              <p>
                Guidance built from each member&apos;s real plan and claims data — using the
                CMS-mandated FHIR APIs your plan already exposes, with no custom IT project.
              </p>
            </div>
            <div className="pillar">
              <div className="pillar-ico">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
              </div>
              <h3>A retention-team workspace</h3>
              <p>
                Risk scoring, next-best-action queues, and campaign tracking — the workspace your
                retention teams and BookCover consultants run together.
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
              The demos cover two of BookCover&apos;s three components — the{" "}
              <strong>Member Tools</strong> and the <strong>Agent Portal</strong>. The third, your
              dedicated retention consultant, is the team that puts them to work. Register once
              and verify with email to unlock both.
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
                  Walk through the member&apos;s journey — from a magic-link invitation, through
                  carrier connection, to the AI plan assistant and Stay/Switch analysis.
                </p>
                <div className="demo-feats">
                  <div className="demo-feat">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Magic-link onboarding &amp; FHIR connection
                  </div>
                  <div className="demo-feat">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    AI virtual assistant for plan questions
                  </div>
                  <div className="demo-feat">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Pre-ANOC cost comparison
                  </div>
                </div>
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
                    {playIcon(15)}
                    Watch preview
                  </button>
                  <button
                    type="button"
                    className={`btn-p${loggedIn ? "" : " demo-locked-btn"}${launching === "member" ? " is-launching" : ""}`}
                    onClick={() => launchDemo("member")}
                    disabled={!!launching}
                    aria-busy={launching === "member"}
                  >
                    {playIcon()}
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
                  Step into the retention team&apos;s workspace — the CRM-style portal where risk
                  scores, member outreach, and campaigns are managed end-to-end.
                </p>
                <div className="demo-feats">
                  <div className="demo-feat">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Member risk scoring dashboard
                  </div>
                  <div className="demo-feat">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Next-best-action outreach queues
                  </div>
                  <div className="demo-feat">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Campaign management &amp; tracking
                  </div>
                </div>
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
                    {playIcon(15)}
                    Watch preview
                  </button>
                  <button
                    type="button"
                    className={`btn-p${loggedIn ? "" : " demo-locked-btn"}${launching === "agent" ? " is-launching" : ""}`}
                    onClick={() => launchDemo("agent")}
                    disabled={!!launching}
                    aria-busy={launching === "agent"}
                  >
                    {playIcon()}
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
            <div className="cta-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <h3 className="white" style={{ fontSize: 22 }}>
              Want to explore on your own?
            </h3>
            <p>
              Register in under a minute, verify with a one-time code, and walk through both demos
              at your own pace.
            </p>
            <button type="button" className="btn-g" onClick={ctaDemos} disabled={!!launching}>
              {playIcon(16)}
              Launch the Live Demos
            </button>
          </div>
          <div className="cta-div" />
          <div className="cta-col">
            <div className="cta-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="white" style={{ fontSize: 22 }}>
              Ready to talk it through?
            </h3>
            <p>
              If you&apos;d like to discuss how BookCover protects your book of business, our
              team is ready to help.
            </p>
            <a className="btn-o lighten" href="/contact">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Contact Us
            </a>
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
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div className="foot-name">BookCover</div>
            </div>
            <div className="foot-comp" style={{ marginTop: 8 }}>
              A <b>CercaLabs</b> product · Protecting your book of business
            </div>
          </div>
          <div className="foot-comp" style={{ textAlign: "right" }}>
            <div>© CercaLabs</div>
            <div style={{ marginTop: 5 }}>
              Demo access is restricted and logged for every registered user.
            </div>
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
