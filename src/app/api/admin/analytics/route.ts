import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  ADMIN_PRODUCT_FILTER_OPTIONS,
  ADMIN_SITE_FILTER_OPTIONS,
  filterEventsByDimensions,
  normalizeProduct,
  normalizeSite,
} from "@/lib/analytics-config";
import {
  aggregateEvents,
  fetchRecentEvents,
  fetchUsageEventsSince,
  filterEvents,
  formatAnalyticsFilterLabel,
  isEventExcluded,
  parseAnalyticsFilters,
  parseAnalyticsPeriod,
} from "@/lib/reports";
import { getReportConfig } from "@/lib/report-config";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const { hours, label } = parseAnalyticsPeriod(url.searchParams.get("period"));
  const dimensionFilters = parseAnalyticsFilters(url.searchParams);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const config = await getReportConfig();
  const allEvents = await fetchUsageEventsSince(since);
  const dimensionScoped = filterEventsByDimensions(allEvents, dimensionFilters);
  const excludedCount = dimensionScoped.filter((e) => isEventExcluded(e, config)).length;
  const events = filterEvents(dimensionScoped, config);
  const summary = aggregateEvents(events);
  summary.excludedEvents = excludedCount;

  const recent = await fetchRecentEvents(since, 80);
  const recentFiltered = recent
    .filter((e) => !isEventExcluded(e, config))
    .filter((e) => filterEventsByDimensions([e], dimensionFilters).length > 0)
    .map((e) => ({
      id: e.id,
      product: normalizeProduct(e.product),
      site: normalizeSite(e.site),
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
      product: dimensionFilters.product,
      site: dimensionFilters.site,
      label: formatAnalyticsFilterLabel(dimensionFilters),
      excludedIps: config.excludedIps,
      excludedCities: config.excludedCities,
    },
    products: ADMIN_PRODUCT_FILTER_OPTIONS,
    sites: ADMIN_SITE_FILTER_OPTIONS,
  });
}
