import { NextResponse } from "next/server";
import {
  demoSessionCookieOptions,
  demoJwtCookieOptions,
  getDemoSessionFromCookies,
  requestHostFrom,
} from "@/lib/demo-session";
import { recordUsageEvent } from "@/lib/tracking";

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
  const host = requestHostFrom(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...demoSessionCookieOptions(0, host), value: "", maxAge: 0 });
  res.cookies.set({ ...demoJwtCookieOptions(0, host), value: "", maxAge: 0 });
  return res;
}
