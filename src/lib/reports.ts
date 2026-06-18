import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import {
  getReportConfig,
  type ReportConfig,
  defaultReportConfig,
} from "@/lib/report-config";

export type UsageEventRow = {
  site?: string;
  eventType?: string;
  path?: string;
  email?: string;
  userId?: string;
  visitorId?: string;
  country?: string;
  region?: string;
  city?: string;
  ip?: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  occurredAt?: { toDate?: () => Date };
};

export type AnalyticsSummary = {
  totalEvents: number;
  excludedEvents: number;
  uniqueVisitors: number;
  uniqueEmails: number;
  registrations: number;
  logins: number;
  demoLaunches: number;
  bySite: Record<string, number>;
  byType: Record<string, number>;
  topPaths: { path: string; count: number }[];
  byCity: { city: string; count: number }[];
  byCountry: { country: string; count: number }[];
};

export type ReportBuildResult = {
  html: string;
  summary: AnalyticsSummary;
  periodStart: string;
  periodEnd: string;
  config: ReportConfig;
};

function toDate(value: UsageEventRow["occurredAt"]): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return null;
}

export function isEventExcluded(
  event: UsageEventRow,
  config: Pick<ReportConfig, "excludedIps" | "excludedCities">
): boolean {
  const ip = event.ip?.trim();
  if (ip && config.excludedIps.some((excluded) => excluded === ip)) {
    return true;
  }
  const city = event.city?.trim().toLowerCase();
  if (city && config.excludedCities.some((excluded) => excluded === city)) {
    return true;
  }
  return false;
}

export function filterEvents(
  events: UsageEventRow[],
  config: Pick<ReportConfig, "excludedIps" | "excludedCities">
): UsageEventRow[] {
  return events.filter((e) => !isEventExcluded(e, config));
}

export function aggregateEvents(events: UsageEventRow[]): AnalyticsSummary {
  const byType: Record<string, number> = {};
  const bySite: Record<string, number> = {};
  const paths: Record<string, number> = {};
  const cities: Record<string, number> = {};
  const countries: Record<string, number> = {};
  const visitors = new Set<string>();
  const emails = new Set<string>();
  let registrations = 0;
  let logins = 0;
  let demoLaunches = 0;

  for (const e of events) {
    const t = e.eventType ?? "unknown";
    byType[t] = (byType[t] ?? 0) + 1;
    const s = e.site ?? "unknown";
    bySite[s] = (bySite[s] ?? 0) + 1;
    if (e.path) paths[e.path] = (paths[e.path] ?? 0) + 1;
    if (e.visitorId) visitors.add(e.visitorId);
    if (e.email) emails.add(e.email);
    if (t === "registration") registrations++;
    if (t === "login") logins++;
    if (t === "demo_launch") demoLaunches++;
    const city = e.city?.trim();
    if (city) cities[city] = (cities[city] ?? 0) + 1;
    const country = e.country?.trim();
    if (country) countries[country] = (countries[country] ?? 0) + 1;
  }

  const topPaths = Object.entries(paths)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  const byCity = Object.entries(cities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([city, count]) => ({ city, count }));

  const byCountry = Object.entries(countries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([country, count]) => ({ country, count }));

  return {
    totalEvents: events.length,
    excludedEvents: 0,
    uniqueVisitors: visitors.size,
    uniqueEmails: emails.size,
    registrations,
    logins,
    demoLaunches,
    bySite,
    byType,
    topPaths,
    byCity,
    byCountry,
  };
}

export async function fetchUsageEventsSince(since: Date): Promise<UsageEventRow[]> {
  if (!isFirebaseAdminConfigured()) return [];
  const db = getAdminDb();
  const snap = await db
    .collection("usageEvents")
    .where("occurredAt", ">=", since)
    .get();
  return snap.docs.map((d) => d.data() as UsageEventRow);
}

export async function fetchRecentEvents(
  since: Date,
  limit = 100
): Promise<(UsageEventRow & { id: string; occurredAtIso: string | null })[]> {
  if (!isFirebaseAdminConfigured()) return [];
  const db = getAdminDb();
  const snap = await db
    .collection("usageEvents")
    .where("occurredAt", ">=", since)
    .limit(500)
    .get();

  const rows = snap.docs.map((d) => {
    const data = d.data() as UsageEventRow;
    const dt = toDate(data.occurredAt);
    return {
      id: d.id,
      ...data,
      occurredAtIso: dt ? dt.toISOString() : null,
    };
  });

  return rows
    .sort((a, b) => {
      const ta = a.occurredAtIso ? Date.parse(a.occurredAtIso) : 0;
      const tb = b.occurredAtIso ? Date.parse(b.occurredAtIso) : 0;
      return tb - ta;
    })
    .slice(0, limit);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tableRows(entries: Record<string, number>): string {
  return (
    Object.entries(entries)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `<tr><td>${escapeHtml(k)}</td><td>${n}</td></tr>`)
      .join("") || `<tr><td colspan="2">None</td></tr>`
  );
}

export function buildReportHtmlFromSummary(
  summary: AnalyticsSummary,
  options: {
    periodStart: Date;
    periodEnd: Date;
    config: ReportConfig;
    excludedCount: number;
  }
): string {
  const { periodStart, periodEnd, config, excludedCount } = options;
  const topPaths = summary.topPaths
    .map(({ path, count }) => `<li>${escapeHtml(path)} — ${count}</li>`)
    .join("");

  const filterNote =
    config.excludedIps.length > 0 || config.excludedCities.length > 0
      ? `<p><em>Filters applied: ${config.excludedIps.length} excluded IP(s), ${config.excludedCities.length} excluded city/cities. ${excludedCount} event(s) removed from this report.</em></p>`
      : "";

  return `
    <h2>BookCover Demo — Daily Usage Report</h2>
    <h3>Configure Report and View Additional Analytics at: https://book-cover-landing.vercel.app/admin </h3>
    <p>Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}</p>
    ${filterNote}
    <ul>
      <li><strong>Total events:</strong> ${summary.totalEvents}</li>
      <li><strong>Unique visitors:</strong> ${summary.uniqueVisitors}</li>
      <li><strong>Unique emails:</strong> ${summary.uniqueEmails}</li>
      <li><strong>Registrations:</strong> ${summary.registrations}</li>
      <li><strong>Logins:</strong> ${summary.logins}</li>
      <li><strong>Demo launches:</strong> ${summary.demoLaunches}</li>
    </ul>
    <h3>By site</h3>
    <table border="1" cellpadding="6"><tr><th>Site</th><th>Count</th></tr>${tableRows(summary.bySite)}</table>
    <h3>By event type</h3>
    <table border="1" cellpadding="6"><tr><th>Type</th><th>Count</th></tr>${tableRows(summary.byType)}</table>
    <h3>Top paths</h3>
    <ul>${topPaths || "<li>None</li>"}</ul>
    <h3>Top cities</h3>
    <ul>${summary.byCity.map(({ city, count }) => `<li>${escapeHtml(city)} — ${count}</li>`).join("") || "<li>None</li>"}</ul>
  `;
}

export async function buildDailyReport(options?: {
  hours?: number;
  config?: ReportConfig;
}): Promise<ReportBuildResult> {
  const hours = options?.hours ?? 24;
  const periodEnd = new Date();
  const periodStart = new Date(Date.now() - hours * 60 * 60 * 1000);
  const config = options?.config ?? (await getReportConfig());

  if (!isFirebaseAdminConfigured()) {
    const empty = aggregateEvents([]);
    return {
      html: "<p>Firebase not configured — no report data.</p>",
      summary: empty,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      config: config.emailRecipients.length ? config : defaultReportConfig(),
    };
  }

  const allEvents = await fetchUsageEventsSince(periodStart);
  const excludedCount = allEvents.filter((e) =>
    isEventExcluded(e, config)
  ).length;
  const events = filterEvents(allEvents, config);
  const summary = aggregateEvents(events);
  summary.excludedEvents = excludedCount;

  return {
    html: buildReportHtmlFromSummary(summary, {
      periodStart,
      periodEnd,
      config,
      excludedCount,
    }),
    summary,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    config,
  };
}

/** @deprecated Use buildDailyReport().html */
export async function buildDailyReportHtml(): Promise<string> {
  const report = await buildDailyReport();
  return report.html;
}

export function parseAnalyticsPeriod(
  raw: string | null
): { hours: number; label: string } {
  switch (raw) {
    case "7d":
      return { hours: 24 * 7, label: "Last 7 days" };
    case "30d":
      return { hours: 24 * 30, label: "Last 30 days" };
    default:
      return { hours: 24, label: "Last 24 hours" };
  }
}
