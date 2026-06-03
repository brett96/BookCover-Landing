import { NextResponse } from "next/server";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { verifyOtp } from "@/lib/otp";
import {
  createDemoSessionCookie,
  demoSessionCookieOptions,
  demoJwtCookieOptions,
} from "@/lib/demo-session";
import { signDemoJwt } from "@/lib/demo-jwt";
import { SESSION_MAX_AGE_MS } from "@/lib/constants";
import { recordUsageEvent } from "@/lib/tracking";

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
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const result = await verifyOtp(uid, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  const sessionCookie = await createDemoSessionCookie(idToken);
  const maxAge = Math.floor(SESSION_MAX_AGE_MS / 1000);
  const res = NextResponse.json({ ok: true, email });
  res.cookies.set({
    ...demoSessionCookieOptions(maxAge),
    value: sessionCookie,
  });
  const jwt = await signDemoJwt({ uid, email });
  if (jwt) {
    res.cookies.set({ ...demoJwtCookieOptions(maxAge), value: jwt });
  }

  await recordUsageEvent(
    {
      site: "landing",
      eventType: "login",
      userId: uid,
      email,
    },
    req
  );

  return res;
}
