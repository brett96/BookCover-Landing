export const DEMO_COOKIE = "__bc_demo";
export const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 7; // 7 days

export const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL ?? "https://bookcover.cercalabs.com";

export const MEMBER_DEMO_URL =
  process.env.NEXT_PUBLIC_MEMBER_DEMO_URL ?? "https://bcmemberdemo.cercalabs.com/";

export const AGENT_DEMO_URL =
  process.env.NEXT_PUBLIC_AGENT_DEMO_URL ??
  "https://bcagentportaldemo.cercalabs.com/demo";

export const COOKIE_DOMAIN =
  process.env.DEMO_COOKIE_DOMAIN ?? ".cercalabs.com";
