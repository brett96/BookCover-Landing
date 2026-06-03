import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;

function parseServiceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

export function isFirebaseAdminConfigured(): boolean {
  return parseServiceAccount() !== null;
}

export function getAdminApp(): App {
  if (!isFirebaseAdminConfigured()) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  }
  if (!app) {
    const existing = getApps()[0];
    if (existing) {
      app = existing;
    } else {
      app = initializeApp({
        credential: cert(parseServiceAccount()!),
      });
    }
  }
  return app;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
