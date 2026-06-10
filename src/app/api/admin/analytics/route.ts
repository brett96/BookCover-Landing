import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  aggregateEvents,
  fetchRecentEvents,
  fetchUsageEventsSince,
  filterEvents,
  isEventExcluded,
  parseAnalyticsPeriod,
} from "@/lib/reports";
import { getReportConfig } from "@/lib/report-config";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const { hours, label } = parseAnalyticsPeriod(url.searchParams.get("period"));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const config = await getReportConfig();
  const allEvents = await fetchUsageEventsSince(since);
  const excludedCount = allEvents.filter((e) => isEventExcluded(e, config)).length;
  const events = filterEvents(allEvents, config);
  const summary = aggregateEvents(events);
  summary.excludedEvents = excludedCount;

  const recent = await fetchRecentEvents(since, 80);
  const recentFiltered = recent
    .filter((e) => filterEvents([e], config).length > 0)
    .map((e) => ({
      id: e.id,
      site: e.site ?? "unknown",
      eventType: e.eventType ?? "unknown",
      path: e.path ?? "",
      email: e.email ?? "",
      ip: e.ip ?? "",
      city: e.city ?? "",
      country: e.country ?? "",
      occurredAt: e.occurredAtIso,
    }));

  return NextResponse.json({
    period: { hours, label, since: since.toISOString() },
    summary,
    recent: recentFiltered,
    filters: {
      excludedIps: config.excludedIps,
      excludedCities: config.excludedCities,
    },
  });
}
