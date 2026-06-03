import { NextResponse } from "next/server";
import {
  getDemoSessionFromCookies,
} from "@/lib/demo-session";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { verifyDemoJwt, DEMO_JWT_COOKIE } from "@/lib/demo-jwt";
import { cookies } from "next/headers";

export async function GET() {
  let session = await getDemoSessionFromCookies();

  if (!session) {
    const jar = await cookies();
    const jwtSession = await verifyDemoJwt(jar.get(DEMO_JWT_COOKIE)?.value);
    if (jwtSession) session = jwtSession;
  }

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  let profile: Record<string, unknown> | null = null;
  if (isFirebaseAdminConfigured()) {
    try {
      const snap = await getAdminDb()
        .collection("demoUsers")
        .doc(session.uid)
        .get();
      if (snap.exists) profile = snap.data() ?? null;
    } catch {
      /* profile optional for session */
    }
  }

  return NextResponse.json({
    authenticated: true,
    uid: session.uid,
    email: session.email,
    profile: profile ?? { email: session.email },
  });
}
