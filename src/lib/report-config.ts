import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";

export type ReportConfig = {
  emailRecipients: string[];
  excludedIps: string[];
  excludedCities: string[];
};

export type StoredReportConfig = ReportConfig & {
  updatedAt?: string;
  updatedBy?: string;
};

const DOC_PATH = { collection: "settings", id: "report" } as const;

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function defaultReportConfig(): ReportConfig {
  const emailRecipients = parseList(process.env.REPORT_EMAIL_TO);
  return {
    emailRecipients,
    excludedIps: [],
    excludedCities: [],
  };
}

export function normalizeReportConfig(input: Partial<ReportConfig>): ReportConfig {
  return {
    emailRecipients: (input.emailRecipients ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    excludedIps: (input.excludedIps ?? []).map((ip) => ip.trim()).filter(Boolean),
    excludedCities: (input.excludedCities ?? [])
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  };
}

export async function getReportConfig(): Promise<StoredReportConfig> {
  const defaults = defaultReportConfig();
  if (!isFirebaseAdminConfigured()) return defaults;

  try {
    const snap = await getAdminDb()
      .collection(DOC_PATH.collection)
      .doc(DOC_PATH.id)
      .get();
    if (!snap.exists) return defaults;
    const data = snap.data() as Partial<StoredReportConfig>;
    const merged = normalizeReportConfig({
      emailRecipients:
        data.emailRecipients && data.emailRecipients.length > 0
          ? data.emailRecipients
          : defaults.emailRecipients,
      excludedIps: data.excludedIps ?? defaults.excludedIps,
      excludedCities: data.excludedCities ?? defaults.excludedCities,
    });
    return {
      ...merged,
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
    };
  } catch {
    return defaults;
  }
}

export async function saveReportConfig(
  config: ReportConfig,
  updatedBy: string
): Promise<StoredReportConfig> {
  const normalized = normalizeReportConfig(config);
  const updatedAt = new Date().toISOString();

  if (isFirebaseAdminConfigured()) {
    await getAdminDb()
      .collection(DOC_PATH.collection)
      .doc(DOC_PATH.id)
      .set(
        {
          ...normalized,
          updatedAt,
          updatedBy,
        },
        { merge: true }
      );
  }

  return { ...normalized, updatedAt, updatedBy };
}
