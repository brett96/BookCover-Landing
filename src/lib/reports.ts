import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";

type EventRow = {
  site?: string;
  eventType?: string;
  path?: string;
  email?: string;
  userId?: string;
  country?: string;
  occurredAt?: { toDate?: () => Date };
};

export async function buildDailyReportHtml(): Promise<string> {
  if (!isFirebaseAdminConfigured()) {
    return "<p>Firebase not configured — no report data.</p>";
  }
  const db = getAdminDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const snap = await db
    .collection("usageEvents")
    .where("occurredAt", ">=", since)
    .get();

  const events: EventRow[] = snap.docs.map((d) => d.data() as EventRow);
  const byType: Record<string, number> = {};
  const bySite: Record<string, number> = {};
  const paths: Record<string, number> = {};
  const emails = new Set<string>();
  let registrations = 0;
  let logins = 0;

  for (const e of events) {
    const t = e.eventType ?? "unknown";
    byType[t] = (byType[t] ?? 0) + 1;
    const s = e.site ?? "unknown";
    bySite[s] = (bySite[s] ?? 0) + 1;
    if (e.path) paths[e.path] = (paths[e.path] ?? 0) + 1;
    if (e.email) emails.add(e.email);
    if (t === "registration") registrations++;
    if (t === "login") logins++;
  }

  const topPaths = Object.entries(paths)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([p, n]) => `<li>${escapeHtml(p)} — ${n}</li>`)
    .join("");

  const siteRows = Object.entries(bySite)
    .map(([s, n]) => `<tr><td>${escapeHtml(s)}</td><td>${n}</td></tr>`)
    .join("");

  const typeRows = Object.entries(byType)
    .map(([t, n]) => `<tr><td>${escapeHtml(t)}</td><td>${n}</td></tr>`)
    .join("");

  return `
    <h2>BookCover Demo — Daily Usage Report</h2>
    <p>Period: last 24 hours ending ${new Date().toISOString()}</p>
    <ul>
      <li><strong>Total events:</strong> ${events.length}</li>
      <li><strong>Unique emails:</strong> ${emails.size}</li>
      <li><strong>Registrations:</strong> ${registrations}</li>
      <li><strong>Logins:</strong> ${logins}</li>
    </ul>
    <h3>By site</h3>
    <table border="1" cellpadding="6"><tr><th>Site</th><th>Count</th></tr>${siteRows}</table>
    <h3>By event type</h3>
    <table border="1" cellpadding="6"><tr><th>Type</th><th>Count</th></tr>${typeRows}</table>
    <h3>Top paths</h3>
    <ul>${topPaths || "<li>None</li>"}</ul>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
