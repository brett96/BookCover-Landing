export const DEMO_HANDOFF_PARAM = "bc_handoff";
export const GATE_FAIL_KEY = "bc_demo_gate_failed";
export const DEMO_HANDOFF_API_PATH = "/api/demo-auth/handoff";

/** Navigate to the demo handoff API (sets __bc_demo_jwt) then redirects into the demo. */
export function demoLaunchUrl(base: string, token: string): string {
  const target = new URL(base);
  const handoff = new URL(DEMO_HANDOFF_API_PATH, target.origin);
  handoff.searchParams.set(DEMO_HANDOFF_PARAM, token);
  const dest = target.pathname + target.search;
  if (dest && dest !== "/") {
    handoff.searchParams.set("dest", dest);
  }
  return handoff.href;
}

export async function fetchHandoffToken(): Promise<string | null> {
  const res = await fetch("/api/auth/ensure-jwt", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { token?: string };
  return typeof data.token === "string" ? data.token : null;
}

export function shouldAbortGateRetry(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  if (!sessionStorage.getItem(GATE_FAIL_KEY)) return false;
  sessionStorage.removeItem(GATE_FAIL_KEY);
  return true;
}

export function markGateRetry(): void {
  sessionStorage?.setItem(GATE_FAIL_KEY, "1");
}

export function clearGateRetry(): void {
  sessionStorage?.removeItem(GATE_FAIL_KEY);
}
