import { NextResponse } from "next/server";
import { demoSessionCookieOptions, demoJwtCookieOptions } from "@/lib/demo-session";
import { recordUsageEvent } from "@/lib/tracking";
import { getDemoSessionFromCookies } from "@/lib/demo-session";

export async function POST(req: Request) {
  const session = await getDemoSessionFromCookies();
  if (session) {
    await recordUsageEvent(
      {
        site: "landing",
        eventType: "logout",
        userId: session.uid,
        email: session.email,
      },
      req
    );
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...demoSessionCookieOptions(0), value: "", maxAge: 0 });
  res.cookies.set({ ...demoJwtCookieOptions(0), value: "", maxAge: 0 });
  return res;
}
