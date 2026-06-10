import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "__bc_admin";
const ADMIN_SESSION_MAX_AGE_SEC = 60 * 60 * 24; // 24 hours

function sessionSecret(): Uint8Array | null {
  const s =
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.DEMO_JWT_SECRET?.trim();
  if (!s) return null;
  return new TextEncoder().encode(s);
}

export function getAdminSeedCredentials(): { email: string; password: string } | null {
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyAdminCredentials(email: string, password: string): boolean {
  const seed = getAdminSeedCredentials();
  if (!seed) return false;
  return (
    safeEqual(email.trim().toLowerCase(), seed.email) &&
    safeEqual(password, seed.password)
  );
}

export async function createAdminSessionToken(email: string): Promise<string | null> {
  const key = sessionSecret();
  if (!key) return null;
  return new SignJWT({ role: "admin", email: email.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SEC}s`)
    .sign(key);
}

export async function verifyAdminSessionToken(
  token: string | undefined
): Promise<{ email: string } | null> {
  if (!token) return null;
  const key = sessionSecret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.role !== "admin" || typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function getAdminFromCookies(): Promise<{ email: string } | null> {
  const jar = await cookies();
  return verifyAdminSessionToken(jar.get(ADMIN_COOKIE)?.value);
}

export function adminCookieOptions(maxAgeSec = ADMIN_SESSION_MAX_AGE_SEC) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    name: ADMIN_COOKIE,
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export async function requireAdminSession(): Promise<
  { email: string } | NextResponse
> {
  const admin = await getAdminFromCookies();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return admin;
}
