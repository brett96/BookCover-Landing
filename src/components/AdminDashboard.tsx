"use client";

import { useCallback, useEffect, useState } from "react";

type Tab = "analytics" | "report";

type AnalyticsSummary = {
  totalEvents: number;
  excludedEvents: number;
  uniqueVisitors: number;
  uniqueEmails: number;
  registrations: number;
  logins: number;
  demoLaunches: number;
  byProduct: Record<string, number>;
  bySite: Record<string, number>;
  byType: Record<string, number>;
};

type FilterOption = { id: string; label: string };

type RecentEvent = {
  id: string;
  product: string;
  site: string;
  eventType: string;
  path: string;
  email: string;
  ip: string;
  city: string;
  country: string;
  occurredAt: string | null;
};

type ReportConfig = {
  emailRecipients: string[];
  excludedIps: string[];
  excludedCities: string[];
  updatedAt?: string;
  updatedBy?: string;
};

function eventPillClass(type: string): string {
  if (type === "registration") return "ev-pill reg";
  if (type === "login") return "ev-pill login";
  if (type === "demo_launch") return "ev-pill demo";
  return "ev-pill";
}

function listToText(values: string[]): string {
  return values.join("\n");
}

function textToList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function labelForOption(id: string, options: FilterOption[]): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("analytics");
  const [authenticated, setAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [period, setPeriod] = useState("24h");
  const [productFilter, setProductFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [filterLabel, setFilterLabel] = useState("");
  const [productOptions, setProductOptions] = useState<FilterOption[]>([]);
  const [siteOptions, setSiteOptions] = useState<FilterOption[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [periodLabel, setPeriodLabel] = useState("Last 24 hours");
  const [recent, setRecent] = useState<RecentEvent[]>([]);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);

  const [recipientsText, setRecipientsText] = useState("");
  const [excludedIpsText, setExcludedIpsText] = useState("");
  const [excludedCitiesText, setExcludedCitiesText] = useState("");
  const [configMeta, setConfigMeta] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<AnalyticsSummary | null>(null);

  const refreshSession = useCallback(async () => {
    const res = await fetch("/api/admin/session", { credentials: "include" });
    const data = await res.json();
    setAuthenticated(!!data.authenticated);
    setAdminEmail(data.email ?? null);
    setConfigured(data.configured !== false);
    setLoading(false);
    return !!data.authenticated;
  }, []);

  const loadAnalytics = useCallback(
    async (p: string, product: string, site: string) => {
      setAnalyticsBusy(true);
      try {
        const params = new URLSearchParams({ period: p, product, site });
        const res = await fetch(`/api/admin/analytics?${params}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        setSummary(data.summary);
        setPeriodLabel(data.period?.label ?? "");
        setRecent(data.recent ?? []);
        setFilterLabel(data.filters?.label ?? "");
        if (Array.isArray(data.products)) setProductOptions(data.products);
        if (Array.isArray(data.sites)) setSiteOptions(data.sites);
      } finally {
        setAnalyticsBusy(false);
      }
    },
    []
  );

  const loadReportConfig = useCallback(async () => {
    const res = await fetch("/api/admin/report-config", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const cfg = data.config as ReportConfig;
    setRecipientsText(listToText(cfg.emailRecipients));
    setExcludedIpsText(listToText(cfg.excludedIps));
    setExcludedCitiesText(listToText(cfg.excludedCities));
    if (cfg.updatedAt) {
      setConfigMeta(
        `Last saved ${new Date(cfg.updatedAt).toLocaleString()}${cfg.updatedBy ? ` by ${cfg.updatedBy}` : ""}`
      );
    }
  }, []);

  const loadPreview = useCallback(
    async (draft = false) => {
      setPreviewBusy(true);
      try {
        const params = new URLSearchParams({
          product: productFilter,
          site: siteFilter,
        });
        if (draft) {
          params.set("draft", "1");
          params.set("recipients", textToList(recipientsText).join(","));
          params.set("excludedIps", textToList(excludedIpsText).join(","));
          params.set("excludedCities", textToList(excludedCitiesText).join(","));
        }
        const res = await fetch(`/api/admin/report-preview?${params}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        setPreviewHtml(data.html ?? "");
        setPreviewSummary(data.summary ?? null);
      } finally {
        setPreviewBusy(false);
      }
    },
    [recipientsText, excludedIpsText, excludedCitiesText, productFilter, siteFilter]
  );

  useEffect(() => {
    refreshSession().then((ok) => {
      if (ok) {
        loadAnalytics(period, productFilter, siteFilter);
        loadReportConfig();
      }
    });
  }, [refreshSession, loadAnalytics, loadReportConfig, period, productFilter, siteFilter]);

  useEffect(() => {
    if (authenticated && tab === "report") {
      loadPreview(true);
    }
  }, [authenticated, tab, productFilter, siteFilter, loadPreview]);

  const switchTab = (next: Tab) => {
    setTab(next);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error ?? "Login failed");
        return;
      }
      setLoginPassword("");
      await refreshSession();
      await loadAnalytics(period, productFilter, siteFilter);
      await loadReportConfig();
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setAuthenticated(false);
    setAdminEmail(null);
    setSummary(null);
    setRecent([]);
    setPreviewHtml("");
  };

  const handleSaveConfig = async () => {
    setSaveMessage("");
    setSaveBusy(true);
    try {
      const res = await fetch("/api/admin/report-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          emailRecipients: textToList(recipientsText),
          excludedIps: textToList(excludedIpsText),
          excludedCities: textToList(excludedCitiesText),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMessage(data.error ?? "Failed to save");
        return;
      }
      setSaveMessage("Settings saved.");
      const cfg = data.config as ReportConfig;
      if (cfg.updatedAt) {
        setConfigMeta(
          `Last saved ${new Date(cfg.updatedAt).toLocaleString()}${cfg.updatedBy ? ` by ${cfg.updatedBy}` : ""}`
        );
      }
      await loadAnalytics(period, productFilter, siteFilter);
      await loadPreview(true);
    } finally {
      setSaveBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-inner">
          <p className="empty">Loading…</p>
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="admin-page">
        <div className="admin-inner">
          <div className="admin-gate">
            <h1>Admin not configured</h1>
            <p>Set <code>ADMIN_SEED_EMAIL</code> and <code>ADMIN_SEED_PASSWORD</code> in your environment.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="admin-page">
        <div className="admin-inner admin-login-wrap">
          <div className="admin-login-card">
            <div className="admin-login-mark">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h1>BookCover Admin</h1>
            <p>Sign in to view analytics and configure daily reports.</p>
            <form onSubmit={handleLogin}>
              {loginError && <div className="m-error show">{loginError}</div>}
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@cercalabs.com"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <button type="submit" className="btn-p full-btn" disabled={loginBusy}>
                {loginBusy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-brand">
            <div className="nav-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <div className="admin-title">BookCover Admin</div>
              <div className="admin-sub">{adminEmail}</div>
            </div>
          </div>
          <div className="admin-header-actions">
            <a href="/" className="nav-link">
              ← Landing site
            </a>
            <button type="button" className="btn-o" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="admin-inner">
        <div className="admin-tabs">
          <button
            type="button"
            className={`admin-tab${tab === "analytics" ? " on" : ""}`}
            onClick={() => switchTab("analytics")}
          >
            Analytics
          </button>
          <button
            type="button"
            className={`admin-tab${tab === "report" ? " on" : ""}`}
            onClick={() => switchTab("report")}
          >
            Daily report
          </button>
        </div>

        {tab === "analytics" && (
          <div className="admin-pane on">
            <div className="admin-toolbar admin-toolbar-filters">
              <label className="admin-period">
                Period{" "}
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              </label>
              <label className="admin-period">
                Product{" "}
                <select
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                >
                  {productOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-period">
                Site{" "}
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                >
                  {siteOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {analyticsBusy && <span className="admin-muted">Refreshing…</span>}
            </div>
            {filterLabel && (
              <p className="admin-filter-label">
                Showing: <strong>{filterLabel}</strong>
              </p>
            )}

            {summary && (
              <>
                <div className="stat-row">
                  <div className="stat-box">
                    <div className="stat-n">{summary.totalEvents}</div>
                    <div className="stat-l">Events ({periodLabel})</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-n">{summary.uniqueVisitors}</div>
                    <div className="stat-l">Unique visitors</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-n">{summary.registrations}</div>
                    <div className="stat-l">Registrations</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-n">{summary.demoLaunches}</div>
                    <div className="stat-l">Demo launches</div>
                  </div>
                </div>

                {summary.excludedEvents > 0 && (
                  <p className="admin-filter-note">
                    {summary.excludedEvents} event(s) excluded by IP/city filters (not shown below).
                  </p>
                )}

                <div className="admin-grid-3">
                  <div>
                    <h3 className="admin-section-title">By product</h3>
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(summary.byProduct).map(([product, count]) => (
                            <tr key={product}>
                              <td>{labelForOption(product, productOptions)}</td>
                              <td>{count}</td>
                            </tr>
                          ))}
                          {Object.keys(summary.byProduct).length === 0 && (
                            <tr>
                              <td colSpan={2} className="empty">
                                No events
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h3 className="admin-section-title">By site</h3>
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Site</th>
                            <th>Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(summary.bySite).map(([site, count]) => (
                            <tr key={site}>
                              <td>{labelForOption(site, siteOptions)}</td>
                              <td>{count}</td>
                            </tr>
                          ))}
                          {Object.keys(summary.bySite).length === 0 && (
                            <tr>
                              <td colSpan={2} className="empty">
                                No events
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h3 className="admin-section-title">By event type</h3>
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(summary.byType).map(([type, count]) => (
                            <tr key={type}>
                              <td>
                                <span className={eventPillClass(type)}>{type}</span>
                              </td>
                              <td>{count}</td>
                            </tr>
                          ))}
                          {Object.keys(summary.byType).length === 0 && (
                            <tr>
                              <td colSpan={2} className="empty">
                                No events
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <h3 className="admin-section-title">Recent events</h3>
                <div className="tbl-wrap tbl-wrap-tall">
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Product</th>
                        <th>Site</th>
                        <th>Event</th>
                        <th>Path</th>
                        <th>Email</th>
                        <th>IP</th>
                        <th>City</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((ev) => (
                        <tr key={ev.id}>
                          <td>
                            {ev.occurredAt
                              ? new Date(ev.occurredAt).toLocaleString()
                              : "—"}
                          </td>
                          <td>{labelForOption(ev.product, productOptions)}</td>
                          <td>{labelForOption(ev.site, siteOptions)}</td>
                          <td>
                            <span className={eventPillClass(ev.eventType)}>{ev.eventType}</span>
                          </td>
                          <td>{ev.path || "—"}</td>
                          <td>{ev.email || "—"}</td>
                          <td>{ev.ip || "—"}</td>
                          <td>{ev.city || "—"}</td>
                        </tr>
                      ))}
                      {recent.length === 0 && (
                        <tr>
                          <td colSpan={8} className="empty">
                            No events in this period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "report" && (
          <div className="admin-pane on">
            <p className="admin-intro">
              Configure the daily email report sent by the Vercel cron job (scheduled report always
              includes <strong>all products</strong> and sites). Preview below uses the same product
              and site filters as the Analytics tab. Exclude traffic by IP or city from included
              events.
            </p>

            <div className="admin-toolbar admin-toolbar-filters">
              <label className="admin-period">
                Preview product{" "}
                <select
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                >
                  {productOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-period">
                Preview site{" "}
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                >
                  {siteOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {previewBusy && <span className="admin-muted">Refreshing preview…</span>}
            </div>
            {filterLabel && (
              <p className="admin-filter-label">
                Preview showing: <strong>{filterLabel}</strong>
              </p>
            )}

            <div className="admin-grid-2 admin-report-grid">
              <div>
                <div className="field">
                  <label>Report recipients (one email per line)</label>
                  <textarea
                    rows={4}
                    value={recipientsText}
                    onChange={(e) => setRecipientsText(e.target.value)}
                    placeholder="team@cercalabs.com"
                  />
                </div>
                <div className="field">
                  <label>Excluded IP addresses (one per line)</label>
                  <textarea
                    rows={4}
                    value={excludedIpsText}
                    onChange={(e) => setExcludedIpsText(e.target.value)}
                    placeholder="203.0.113.10"
                  />
                </div>
                <div className="field">
                  <label>Excluded cities (one per line, case-insensitive)</label>
                  <textarea
                    rows={4}
                    value={excludedCitiesText}
                    onChange={(e) => setExcludedCitiesText(e.target.value)}
                    placeholder="San Francisco"
                  />
                </div>
                {configMeta && <p className="admin-muted">{configMeta}</p>}
                {saveMessage && (
                  <p className={saveMessage.includes("Failed") ? "m-error show" : "admin-save-ok"}>
                    {saveMessage}
                  </p>
                )}
                <div className="admin-actions">
                  <button
                    type="button"
                    className="btn-o"
                    onClick={() => loadPreview(true)}
                    disabled={previewBusy}
                  >
                    {previewBusy ? "Loading…" : "Refresh preview"}
                  </button>
                  <button
                    type="button"
                    className="btn-p"
                    onClick={handleSaveConfig}
                    disabled={saveBusy}
                  >
                    {saveBusy ? "Saving…" : "Save settings"}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="admin-section-title">Report preview (last 24 hours)</h3>
                {previewSummary && (
                  <p className="admin-muted">
                    {previewSummary.totalEvents} events included
                    {previewSummary.excludedEvents > 0
                      ? ` · ${previewSummary.excludedEvents} excluded`
                      : ""}
                  </p>
                )}
                <div
                  className="admin-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml || "<p>No data yet.</p>" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
