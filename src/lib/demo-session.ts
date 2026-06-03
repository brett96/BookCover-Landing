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

function cookieBase(maxAgeSec: number) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
    ...(isProd && COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
}

export function demoSessionCookieOptions(maxAgeSec: number) {
  return { name: DEMO_COOKIE, ...cookieBase(maxAgeSec) };
}

export function demoJwtCookieOptions(maxAgeSec: number) {
  return { name: DEMO_JWT_COOKIE, ...cookieBase(maxAgeSec) };
}

export async function createDemoSessionCookie(idToken: string): Promise<string> {
  const expiresIn = SESSION_MAX_AGE_MS;
  return getAdminAuth().createSessionCookie(idToken, { expiresIn });
}
