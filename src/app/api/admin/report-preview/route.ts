import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { parseAnalyticsFilters } from "@/lib/analytics-config";
import { buildDailyReport } from "@/lib/reports";
import { getReportConfig, normalizeReportConfig } from "@/lib/report-config";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const useDraft = url.searchParams.get("draft") === "1";
  const dimensions = parseAnalyticsFilters(url.searchParams);

  let config = await getReportConfig();
  if (useDraft) {
    const recipients = url.searchParams.get("recipients");
    const ips = url.searchParams.get("excludedIps");
    const cities = url.searchParams.get("excludedCities");
    config = normalizeReportConfig({
      emailRecipients: recipients
        ? recipients.split(",").map((s) => s.trim())
        : config.emailRecipients,
      excludedIps: ips ? ips.split(",").map((s) => s.trim()) : config.excludedIps,
      excludedCities: cities
        ? cities.split(",").map((s) => s.trim())
        : config.excludedCities,
    });
  }

  const report = await buildDailyReport({ hours: 24, config, dimensions });
  return NextResponse.json({
    html: report.html,
    summary: report.summary,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    config: report.config,
    filters: report.dimensionFilters,
  });
}
