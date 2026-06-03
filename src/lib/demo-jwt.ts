import { SignJWT, jwtVerify } from "jose";

export const DEMO_JWT_COOKIE = "__bc_demo_jwt";

function secret(): Uint8Array | null {
  const s = process.env.DEMO_JWT_SECRET?.trim();
  if (!s) return null;
  return new TextEncoder().encode(s);
}

export async function signDemoJwt(payload: {
  uid: string;
  email: string;
}): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function verifyDemoJwt(
  token: string | undefined
): Promise<{ uid: string; email: string } | null> {
  if (!token) return null;
  const key = secret();
  if (!key) {
    if (process.env.NODE_ENV === "development") {
      return { uid: "dev", email: "dev@local" };
    }
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.uid !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { uid: payload.uid, email: payload.email };
  } catch {
    return null;
  }
}
