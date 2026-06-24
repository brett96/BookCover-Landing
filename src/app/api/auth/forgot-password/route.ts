import { NextResponse } from "next/server";
import { createPasswordResetLink } from "@/lib/password-reset";
import { sendPasswordResetLinkEmail } from "@/lib/email";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { recordUsageEvent, landingTrackEvent } from "@/lib/tracking";

export async function POST(req: Request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured yet." },
      { status: 503 }
    );
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const link = await createPasswordResetLink(email);
    if (link) {
      const sent = await sendPasswordResetLinkEmail(email, link);
      if (!sent.ok) {
        console.error("[forgot-password] email failed:", sent.error);
        return NextResponse.json(
          { error: "Could not send the reset email. Try again later." },
          { status: 503 }
        );
      }
      await recordUsageEvent(
        landingTrackEvent({
          site: "landing",
          eventType: "password_reset_request",
          email,
          properties: { channel: "smtp" },
        }),
        req
      );
    }

    // Always succeed from the client's perspective (do not reveal account existence).
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    const message =
      err instanceof Error && err.message.includes("UNAUTHORIZED_DOMAIN")
        ? "Password reset is misconfigured. Ensure bookcover.cercalabs.com is a Firebase Authorized domain and NEXT_PUBLIC_LANDING_URL matches it."
        : "Could not process password reset.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
