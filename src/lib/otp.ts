import { createHash, randomInt } from "crypto";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string, uid: string): string {
  return createHash("sha256").update(`${uid}:${code}`).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

export async function storeOtp(uid: string, code: string): Promise<void> {
  if (!isFirebaseAdminConfigured()) return;
  const db = getAdminDb();
  await db.collection("otpCodes").doc(uid).set({
    hash: hashCode(code, uid),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    updatedAt: new Date(),
  });
}

export async function verifyOtp(
  uid: string,
  code: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isFirebaseAdminConfigured()) {
    if (process.env.NODE_ENV === "development" && code === "000000") {
      return { ok: true };
    }
    return { ok: false, reason: "Server not configured" };
  }
  const db = getAdminDb();
  const ref = db.collection("otpCodes").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, reason: "No code found. Request a new one." };
  }
  const data = snap.data() as {
    hash: string;
    expiresAt: number;
    attempts: number;
  };
  if (data.expiresAt < Date.now()) {
    await ref.delete();
    return { ok: false, reason: "Code expired. Request a new one." };
  }
  if (data.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "Too many attempts. Request a new code." };
  }
  const match = data.hash === hashCode(code, uid);
  if (!match) {
    await ref.update({ attempts: data.attempts + 1 });
    return { ok: false, reason: "Invalid code. Try again." };
  }
  await ref.delete();
  return { ok: true };
}
