import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  getReportConfig,
  normalizeReportConfig,
  saveReportConfig,
  type ReportConfig,
} from "@/lib/report-config";

export async function GET() {
  const auth = await requireAdminSession();
  if (auth instanceof NextResponse) return auth;

  const config = await getReportConfig();
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  const auth = await requireAdminSession();
  if (auth instanceof NextResponse) return auth;

  let body: Partial<ReportConfig>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const config = normalizeReportConfig({
    emailRecipients: Array.isArray(body.emailRecipients) ? body.emailRecipients : [],
    excludedIps: Array.isArray(body.excludedIps) ? body.excludedIps : [],
    excludedCities: Array.isArray(body.excludedCities) ? body.excludedCities : [],
  });

  const saved = await saveReportConfig(config, auth.email);
  return NextResponse.json({ config: saved });
}
