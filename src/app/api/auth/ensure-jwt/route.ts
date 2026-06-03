import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getDemoSessionFromCookies,
  demoJwtCookieOptions,
  requestHostFrom,
} from "@/lib/demo-session";
import { signDemoJwt, verifyDemoJwt, DEMO_JWT_COOKIE } from "@/lib/demo-jwt";
import { SESSION_MAX_AGE_MS } from "@/lib/constants";

/** Mint __bc_demo_jwt when the user has a landing session but the portal cookie is missing. */
export async function POST(req: Request) {
  const session = await getDemoSessionFromCookies();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const jar = await cookies();
  const existing = jar.get(DEMO_JWT_COOKIE)?.value;
  if (existing && (await verifyDemoJwt(existing))) {
    return NextResponse.json({ ok: true, alreadyHadJwt: true });
  }

  const jwt = await signDemoJwt({ uid: session.uid, email: session.email });
  if (!jwt) {
    return NextResponse.json(
      { ok: false, error: "DEMO_JWT_SECRET is not configured on landing" },
      { status: 503 }
    );
  }

  const host = requestHostFrom(req);
  const maxAge = Math.floor(SESSION_MAX_AGE_MS / 1000);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...demoJwtCookieOptions(maxAge, host), value: jwt });
  return res;
}
