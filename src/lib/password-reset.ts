import { LANDING_URL } from "@/lib/constants";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";

/** Continue URL for password-reset links — must match a Firebase Authorized domain. */
export function passwordResetContinueUrl(): string {
  const base = LANDING_URL.trim() || "https://bookcover.cercalabs.com";
  return `${base.replace(/\/$/, "")}/reset-password`;
}

export function passwordResetActionSettings() {
  return {
    url: passwordResetContinueUrl(),
    handleCodeInApp: true as const,
  };
}

function isUserNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "auth/user-not-found"
  );
}

export async function createPasswordResetLink(email: string): Promise<string | null> {
  if (!isFirebaseAdminConfigured()) return null;
  try {
    return await getAdminAuth().generatePasswordResetLink(
      email,
      passwordResetActionSettings()
    );
  } catch (err) {
    if (isUserNotFound(err)) return null;
    throw err;
  }
}
