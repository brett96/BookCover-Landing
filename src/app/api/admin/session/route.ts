import { NextResponse } from "next/server";
import { getAdminFromCookies, getAdminSeedCredentials } from "@/lib/admin-auth";

export async function GET() {
  const configured = !!getAdminSeedCredentials();
  const admin = await getAdminFromCookies();
  return NextResponse.json({
    authenticated: !!admin,
    email: admin?.email ?? null,
    configured,
  });
}
