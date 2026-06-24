import { NextResponse } from "next/server";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { verifyOtp } from "@/lib/otp";
import {
  createDemoSessionCookie,
  demoSessionCookieOptions,
  demoJwtCookieOptions,
  requestHostFrom,
} from "@/lib/demo-session";
import { signDemoJwt } from "@/lib/demo-jwt";
import { SESSION_MAX_AGE_MS } from "@/lib/constants";
import { recordUsageEvent, landingTrackEvent } from "@/lib/tracking";
import { getAdminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  const body = (await req.json()) as { idToken?: string; code?: string };
  const idToken = body.idToken?.trim();
  const code = body.code?.trim();
  if (!idToken || !code) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 503 }
    );
  }
  let uid: string;
  let email: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email ?? "";
  } catch {
    return NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const result = await verifyOtp(uid, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  let sessionCookie: string;
  try {
    sessionCookie = await createDemoSessionCookie(idToken);
  } catch (err) {
    console.error("[verify-otp] createSessionCookie failed", err);
    return NextResponse.json(
      { error: "Could not create session. Please sign in again." },
      { status: 401 }
    );
  }

  const host = requestHostFrom(req);
  const maxAge = Math.floor(SESSION_MAX_AGE_MS / 1000);

  const jwt = await signDemoJwt({ uid, email });
  if (!jwt && process.env.NODE_ENV === "production") {
    console.error("[verify-otp] DEMO_JWT_SECRET is not set — demo portals will reject access");
  }

  let profile: Record<string, unknown> | null = null;
  try {
    const snap = await getAdminDb().collection("demoUsers").doc(uid).get();
    if (snap.exists) profile = snap.data() ?? null;
  } catch {
    /* optional */
  }

  const res = NextResponse.json({
    ok: true,
    email,
    profile: profile ?? { email },
  });

  res.cookies.set({
    ...demoSessionCookieOptions(maxAge, host),
    value: sessionCookie,
  });
  if (jwt) {
    res.cookies.set({ ...demoJwtCookieOptions(maxAge, host), value: jwt });
  }

  try {
    await recordUsageEvent(
      landingTrackEvent({
        site: "landing",
        eventType: "login",
        userId: uid,
        email,
      }),
      req
    );
  } catch (err) {
    console.error("[verify-otp] track", err);
  }

  return res;
}
