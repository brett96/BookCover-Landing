import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;
let db: Firestore | undefined;

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

export function getServiceAccountProjectId(): string | null {
  return parseServiceAccount()?.project_id?.trim() ?? null;
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
      const serviceAccount = parseServiceAccount()!;
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
      const clientProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
      if (clientProject && clientProject !== serviceAccount.project_id) {
        console.error(
          `[firebase] project mismatch: FIREBASE_SERVICE_ACCOUNT project_id is "${serviceAccount.project_id}" but NEXT_PUBLIC_FIREBASE_PROJECT_ID is "${clientProject}"`
        );
      }
    }
  }
  return app;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  if (!db) {
    db = getFirestore(getAdminApp());
  }
  return db;
}

export function isFirestoreNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: number }).code === 5
  );
}

export const FIRESTORE_SETUP_HINT =
  "Firestore database not found. In Firebase Console (same project as FIREBASE_SERVICE_ACCOUNT), go to Build → Firestore Database → Create database.";
