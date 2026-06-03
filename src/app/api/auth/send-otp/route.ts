import { NextResponse } from "next/server";
import {
  getAdminAuth,
  isFirebaseAdminConfigured,
  isFirestoreNotFoundError,
} from "@/lib/firebase/admin";
import { generateOtpCode, storeOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/email";
import { recordUsageEvent } from "@/lib/tracking";

export async function POST(req: Request) {
  const body = (await req.json()) as { idToken?: string };
  const idToken = body.idToken?.trim();
  if (!idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
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
    if (!email) {
      return NextResponse.json({ error: "No email on account" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const code = generateOtpCode();
  try {
    await storeOtp(uid, code);
  } catch (err) {
    if (isFirestoreNotFoundError(err)) {
      return NextResponse.json(
        {
          error:
            "Verification storage is not set up. Firestore must be enabled in your Firebase project.",
        },
        { status: 503 }
      );
    }
    console.error("[send-otp] storeOtp", err);
    return NextResponse.json(
      { error: "Could not store verification code" },
      { status: 500 }
    );
  }

  const sent = await sendOtpEmail(email, code);
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 500 });
  }

  try {
    await recordUsageEvent(
      {
        site: "landing",
        eventType: "otp_sent",
        userId: uid,
        email,
      },
      req
    );
  } catch (err) {
    console.error("[send-otp] track", err);
  }

  return NextResponse.json({ ok: true });
}
