export const DEMO_COOKIE = "__bc_demo";
export const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 7; // 7 days

export const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL ?? "https://bookcover.cercalabs.com";

/** Production host for member demo — cookies only work on *.cercalabs.com. */
export const CANONICAL_MEMBER_DEMO_URL =
  "https://bcmemberdemo.cercalabs.com/";

export const CANONICAL_AGENT_DEMO_URL =
  "https://bcagentportaldemo.cercalabs.com/demo";

function isVercelHost(hostname: string): boolean {
  return hostname.endsWith(".vercel.app");
}

/** Always navigate to the cercalabs.com member demo so __bc_demo_jwt is sent. */
export function normalizeMemberDemoUrl(url?: string | null): string {
  if (!url?.trim()) return CANONICAL_MEMBER_DEMO_URL;
  try {
    const u = new URL(url);
    if (isVercelHost(u.hostname) || u.hostname.includes("bc-member-demo")) {
      return CANONICAL_MEMBER_DEMO_URL;
    }
    if (u.hostname.endsWith("cercalabs.com")) return u.href;
  } catch {
    /* invalid */
  }
  return CANONICAL_MEMBER_DEMO_URL;
}

export function normalizeAgentDemoUrl(url?: string | null): string {
  if (!url?.trim()) return CANONICAL_AGENT_DEMO_URL;
  try {
    const u = new URL(url);
    if (isVercelHost(u.hostname)) return CANONICAL_AGENT_DEMO_URL;
    if (u.hostname.endsWith("cercalabs.com")) return u.href;
  } catch {
    /* invalid */
  }
  return CANONICAL_AGENT_DEMO_URL;
}

export const MEMBER_DEMO_URL = normalizeMemberDemoUrl(
  process.env.NEXT_PUBLIC_MEMBER_DEMO_URL
);

export const AGENT_DEMO_URL = normalizeAgentDemoUrl(
  process.env.NEXT_PUBLIC_AGENT_DEMO_URL
);

/** Map portal return URLs (including stale *.vercel.app) to the canonical demo host. */
export type DemoReturnTarget = { which: "member" | "agent"; url: string };

export function resolveDemoReturn(returnUrl: string | null): DemoReturnTarget | null {
  if (!returnUrl?.trim()) return null;
  try {
    const u = new URL(returnUrl);
    const host = u.hostname;
    if (
      host.includes("bcagent") ||
      host.includes("agentportal") ||
      u.pathname.startsWith("/demo")
    ) {
      return { which: "agent", url: normalizeAgentDemoUrl(returnUrl) };
    }
    if (host.endsWith("cercalabs.com") || isVercelHost(host)) {
      return { which: "member", url: normalizeMemberDemoUrl(returnUrl) };
    }
  } catch {
    /* invalid */
  }
  return null;
}

/** @deprecated Use resolveDemoReturn */
export function resolveMemberDemoReturn(returnUrl: string | null): string | null {
  const target = resolveDemoReturn(returnUrl);
  return target?.which === "member" ? target.url : null;
}

export const COOKIE_DOMAIN =
  process.env.DEMO_COOKIE_DOMAIN ?? ".cercalabs.com";
