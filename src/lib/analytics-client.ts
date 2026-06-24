import { deploymentAnalyticsProduct } from "@/lib/analytics-config";

const VISITOR_KEY = "bc_visitor_id";
const SESSION_KEY = "bc_session_id";
const ANALYTICS_PRODUCT = deploymentAnalyticsProduct();

function randomId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getVisitorId(): string {
  if (typeof window === "undefined") return "anon";
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "anon";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = randomId();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export async function trackEvent(
  eventType: string,
  extra?: {
    path?: string;
    properties?: Record<string, unknown>;
    site?: "landing" | "member" | "agent";
  }
): Promise<void> {
  await fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product: ANALYTICS_PRODUCT,
      site: extra?.site ?? "landing",
      eventType,
      path: extra?.path ?? window.location.pathname,
      referrer: document.referrer || null,
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      properties: extra?.properties,
    }),
  }).catch(() => {});
}
