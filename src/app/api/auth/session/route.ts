import { NextResponse } from "next/server";
import { getDemoSessionFromCookies } from "@/lib/demo-session";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";

export async function GET() {
  const session = await getDemoSessionFromCookies();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  let profile: Record<string, unknown> | null = null;
  if (isFirebaseAdminConfigured()) {
    const snap = await getAdminDb()
      .collection("demoUsers")
      .doc(session.uid)
      .get();
    if (snap.exists) profile = snap.data() ?? null;
  }
  return NextResponse.json({
    authenticated: true,
    uid: session.uid,
    email: session.email,
    profile,
  });
}
