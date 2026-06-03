import { cookies } from "next/headers";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { DEMO_COOKIE, SESSION_MAX_AGE_MS, COOKIE_DOMAIN } from "@/lib/constants";
import { DEMO_JWT_COOKIE } from "@/lib/demo-jwt";

export type DemoSessionUser = {
  uid: string;
  email: string;
};

export async function verifyDemoSessionCookie(
  cookieValue: string | undefined
): Promise<DemoSessionUser | null> {
  if (!cookieValue || !isFirebaseAdminConfigured()) return null;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(
      cookieValue,
      true
    );
    if (!decoded.email) return null;
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

export async function getDemoSessionFromCookies(): Promise<DemoSessionUser | null> {
  const jar = await cookies();
  return verifyDemoSessionCookie(jar.get(DEMO_COOKIE)?.value);
}

/** Only set Domain=.cercalabs.com when the response is served from that host tree. */
export function resolveCookieDomain(requestHost?: string): string | undefined {
  const domain = COOKIE_DOMAIN?.trim();
  if (!domain || process.env.NODE_ENV !== "production") return undefined;
  const host = (requestHost ?? "").toLowerCase();
  if (host === "cercalabs.com" || host.endsWith(".cercalabs.com")) {
    return domain;
  }
  return undefined;
}

function cookieBase(maxAgeSec: number, requestHost?: string) {
  const isProd = process.env.NODE_ENV === "production";
  const domain = resolveCookieDomain(requestHost);
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
    ...(domain ? { domain } : {}),
  };
}

export function demoSessionCookieOptions(
  maxAgeSec: number,
  requestHost?: string
) {
  return { name: DEMO_COOKIE, ...cookieBase(maxAgeSec, requestHost) };
}

export function demoJwtCookieOptions(maxAgeSec: number, requestHost?: string) {
  return { name: DEMO_JWT_COOKIE, ...cookieBase(maxAgeSec, requestHost) };
}

export async function createDemoSessionCookie(idToken: string): Promise<string> {
  const expiresIn = SESSION_MAX_AGE_MS;
  return getAdminAuth().createSessionCookie(idToken, { expiresIn });
}

export function requestHostFrom(req: Request): string {
  try {
    return new URL(req.url).hostname;
  } catch {
    return "";
  }
}
