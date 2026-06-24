/** Shared Firestore `usageEvents` product/site dimensions (all BookCover deployments). */

export const PRODUCTS = [
  "independent-agents",
  "bookcover-landing",
  "member-demo",
  "agent-demo",
] as const;

export type ProductSlug = (typeof PRODUCTS)[number];
export type NormalizedProduct = ProductSlug | "legacy";

export const SITES = ["landing", "member", "agent"] as const;
export type SiteSlug = (typeof SITES)[number];

export const PRODUCT_LABELS: Record<NormalizedProduct, string> = {
  "bookcover-landing": "BookCover Landing",
  "member-demo": "Member Demo",
  "agent-demo": "Agent Portal Demo",
  "independent-agents": "Independent Agents",
  legacy: "Legacy (no product)",
};

export const SITE_LABELS: Record<SiteSlug | "unknown", string> = {
  landing: "Landing",
  member: "Member",
  agent: "Agent",
  unknown: "Unknown",
};

export const DEFAULT_ANALYTICS_PRODUCT: ProductSlug = "bookcover-landing";

export function deploymentAnalyticsProduct(): ProductSlug {
  const fromEnv = process.env.NEXT_PUBLIC_ANALYTICS_PRODUCT?.trim().toLowerCase();
  if (fromEnv && isKnownProduct(fromEnv)) return fromEnv;
  return DEFAULT_ANALYTICS_PRODUCT;
}

export function isKnownProduct(value: string): value is ProductSlug {
  return (PRODUCTS as readonly string[]).includes(value);
}

export function isKnownSite(value: string): value is SiteSlug {
  return (SITES as readonly string[]).includes(value);
}

/** Events missing `product` are treated as legacy in admin filters. */
export function normalizeProduct(raw?: string | null): NormalizedProduct {
  if (!raw?.trim()) return "legacy";
  const v = raw.trim().toLowerCase();
  return isKnownProduct(v) ? v : "legacy";
}

export function normalizeSite(raw?: string | null): SiteSlug | "unknown" {
  if (!raw?.trim()) return "unknown";
  const v = raw.trim().toLowerCase();
  return isKnownSite(v) ? v : "unknown";
}

export type AnalyticsDimensionFilters = {
  product: "all" | NormalizedProduct;
  site: "all" | SiteSlug;
};

export function parseAnalyticsFilters(
  searchParams: URLSearchParams | { get(name: string): string | null }
): AnalyticsDimensionFilters {
  const productRaw = searchParams.get("product") ?? "all";
  const siteRaw = searchParams.get("site") ?? "all";

  const product: AnalyticsDimensionFilters["product"] =
    productRaw === "all"
      ? "all"
      : productRaw === "legacy"
        ? "legacy"
        : isKnownProduct(productRaw)
          ? productRaw
          : "all";

  const site: AnalyticsDimensionFilters["site"] =
    siteRaw === "all" ? "all" : isKnownSite(siteRaw) ? siteRaw : "all";

  return { product, site };
}

export function formatAnalyticsFilterLabel(filters: AnalyticsDimensionFilters): string {
  const productPart =
    filters.product === "all"
      ? "All products"
      : PRODUCT_LABELS[filters.product];
  const sitePart =
    filters.site === "all" ? "All sites" : SITE_LABELS[filters.site];
  return `${productPart} · ${sitePart}`;
}

export function filterEventsByDimensions<
  T extends { product?: string | null; site?: string | null },
>(events: T[], filters: AnalyticsDimensionFilters): T[] {
  return events.filter((event) => {
    if (filters.product !== "all") {
      const product = normalizeProduct(event.product);
      if (product !== filters.product) return false;
    }
    if (filters.site !== "all") {
      const site = normalizeSite(event.site);
      if (site !== filters.site) return false;
    }
    return true;
  });
}

export function resolveIngestProduct(fromClient?: string | null): ProductSlug {
  const v = fromClient?.trim().toLowerCase();
  if (v && isKnownProduct(v)) return v;
  return deploymentAnalyticsProduct();
}

export function resolveIngestSite(
  fromClient?: string | null,
  fallback: SiteSlug = "landing"
): SiteSlug {
  const v = fromClient?.trim().toLowerCase();
  if (v && isKnownSite(v)) return v;
  return fallback;
}

export const PRODUCTS_METADATA = PRODUCTS.map((id) => ({
  id,
  label: PRODUCT_LABELS[id],
}));

export const SITES_METADATA = SITES.map((id) => ({
  id,
  label: SITE_LABELS[id],
}));

/** Product options for admin filter dropdowns (display order). */
export const ADMIN_PRODUCT_FILTER_OPTIONS = [
  { id: "all", label: "All products" },
  { id: "independent-agents", label: PRODUCT_LABELS["independent-agents"] },
  { id: "bookcover-landing", label: PRODUCT_LABELS["bookcover-landing"] },
  { id: "member-demo", label: PRODUCT_LABELS["member-demo"] },
  { id: "agent-demo", label: PRODUCT_LABELS["agent-demo"] },
  { id: "legacy", label: PRODUCT_LABELS.legacy },
];

export const ADMIN_SITE_FILTER_OPTIONS = [
  { id: "all", label: "All sites" },
  ...SITES_METADATA,
];
