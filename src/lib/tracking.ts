import { UAParser } from "ua-parser-js";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";

export type SiteId = "landing" | "member" | "agent";

export type UsageEventInput = {
  site: SiteId;
  eventType: string;
  path?: string;
  referrer?: string | null;
  userId?: string;
  email?: string;
  visitorId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  userAgent?: string;
};

export function parseRequestGeo(req: Request): {
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
} {
  const uaStr = req.headers.get("user-agent") ?? "";
  const ua = new UAParser(uaStr).getResult();
  const decodeSafe = (v: string | null) => {
    if (!v) return undefined;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ipRaw =
    forwardedFor?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  return {
    ip: ipRaw ? ipRaw.slice(0, 64) : undefined,
    country: req.headers.get("x-vercel-ip-country") ?? undefined,
    region: decodeSafe(req.headers.get("x-vercel-ip-country-region")),
    city: decodeSafe(req.headers.get("x-vercel-ip-city")),
    userAgent: uaStr || undefined,
    deviceType: ua.device.type ?? "desktop",
    browser: ua.browser.name ?? "",
    os: ua.os.name ?? "",
  };
}

export async function recordUsageEvent(
  input: UsageEventInput,
  req?: Request
): Promise<void> {
  if (!isFirebaseAdminConfigured()) {
    if (process.env.NODE_ENV === "development") {
      console.info("[track]", input);
    }
    return;
  }
  const geo = req ? parseRequestGeo(req) : {};
  const db = getAdminDb();
  await db.collection("usageEvents").add({
    ...input,
    ...geo,
    path: input.path?.slice(0, 2048) ?? "",
    eventType: input.eventType.slice(0, 32),
    visitorId: (input.visitorId ?? "anon").slice(0, 64),
    sessionId: (input.sessionId ?? input.visitorId ?? "anon").slice(0, 64),
    properties: input.properties ?? {},
    occurredAt: new Date(),
  });
}

export type DemoUserProfile = {
  first: string;
  last: string;
  email: string;
  phone: string;
  company: string;
  title?: string;
  biz: string;
  createdAt: number;
};

export async function saveDemoUserProfile(
  uid: string,
  profile: DemoUserProfile
): Promise<void> {
  if (!isFirebaseAdminConfigured()) return;
  const db = getAdminDb();
  await db.collection("demoUsers").doc(uid).set(
    { ...profile, updatedAt: new Date() },
    { merge: true }
  );
}
