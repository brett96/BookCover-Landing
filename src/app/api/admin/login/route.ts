import { NextResponse } from "next/server";
import {
  adminCookieOptions,
  createAdminSessionToken,
  getAdminSeedCredentials,
  verifyAdminCredentials,
} from "@/lib/admin-auth";

export async function POST(req: Request) {
  const seed = getAdminSeedCredentials();
  if (!seed) {
    return NextResponse.json(
      { error: "Admin login is not configured (set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD)" },
      { status: 503 }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (!verifyAdminCredentials(email, password)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createAdminSessionToken(email);
  if (!token) {
    return NextResponse.json(
      { error: "Admin session secret is not configured" },
      { status: 503 }
    );
  }

  const res = NextResponse.json({ ok: true, email: email.toLowerCase() });
  const opts = adminCookieOptions();
  res.cookies.set(opts.name, token, opts);
  return res;
}
