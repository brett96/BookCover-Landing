import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  appendInquiryToSheet,
  type SheetInquiryPayload,
} from "@/lib/sheets/append-inquiry";
import { sendInquiryNotificationEmail } from "@/lib/email";
import { recordUsageEvent } from "@/lib/tracking";

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalString(v: unknown, max: number): string | null {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  return s.slice(0, max);
}

type InquiryFields = {
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  role: string | null;
  message: string | null;
  visitorId: string | null;
  sessionId: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

function parseBody(body: unknown):
  | { ok: true; data: InquiryFields }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;
  const name = (b.name ?? "").toString().trim();
  const email = (b.email ?? "").toString().trim();
  if (!name) {
    return { ok: false, error: "Please enter your full name." };
  }
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid work email." };
  }
  return {
    ok: true,
    data: {
      name: name.slice(0, 255),
      email: email.slice(0, 255),
      company: optionalString(b.company, 255),
      phone: optionalString(b.phone, 64),
      role: optionalString(b.role, 255),
      message: optionalString(b.message, 4000),
      visitorId: optionalString(b.visitorId, 64),
      sessionId: optionalString(b.sessionId, 64),
      utm_source: optionalString(b.utm_source, 255),
      utm_medium: optionalString(b.utm_medium, 255),
      utm_campaign: optionalString(b.utm_campaign, 255),
    },
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const submittedAt = new Date().toISOString();

  const h = await headers();
  const referrer = h.get("referer");

  const sheetPayload: SheetInquiryPayload = {
    name: data.name,
    email: data.email,
    company: data.company ?? "",
    phone: data.phone ?? "",
    role: data.role ?? "",
    message: data.message ?? "",
    submittedAt,
    visitorId: data.visitorId,
    sessionId: data.sessionId,
    utmSource: data.utm_source,
    utmMedium: data.utm_medium,
    utmCampaign: data.utm_campaign,
    referrer: referrer ?? null,
    leadId: null,
  };

  const sheetResult = await appendInquiryToSheet(sheetPayload);
  const sheetStored =
    sheetResult.ok && !("skipped" in sheetResult && sheetResult.skipped);

  let emailStored = false;
  let emailError: string | undefined;
  const notifyTo =
    process.env.LEAD_NOTIFICATION_EMAIL?.trim() ||
    process.env.REPORT_EMAIL_TO?.split(",")[0]?.trim();
  if (notifyTo) {
    const emailRes = await sendInquiryNotificationEmail(notifyTo, sheetPayload);
    emailStored = emailRes.ok;
    if (!emailRes.ok) emailError = emailRes.error;
  }

  try {
    await recordUsageEvent(
      {
        site: "landing",
        eventType: "form_submit",
        path: "/contact",
        referrer: referrer ?? undefined,
        visitorId: data.visitorId ?? undefined,
        sessionId: data.sessionId ?? undefined,
        properties: { role: data.role, storedInSheet: sheetStored },
      },
      req
    );
  } catch (err) {
    console.error("[bookcover-inquiry] track", err);
  }

  if (!sheetStored && !emailStored) {
    const sheetSkipped =
      "skipped" in sheetResult && sheetResult.skipped;
    return NextResponse.json(
      {
        ok: false,
        error: sheetSkipped
          ? "Contact form is not configured yet. Please email info@cercalabs.com."
          : "We couldn't save your submission right now. Please try again or email info@cercalabs.com.",
        ...(sheetResult.ok === false ? { sheetError: sheetResult.error } : {}),
        ...(emailError ? { emailError } : {}),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    storedInSheet: sheetStored,
    storedInEmail: emailStored,
    ...(sheetResult.ok === false ? { sheetError: sheetResult.error } : {}),
    ...(emailError ? { emailError } : {}),
  });
}
