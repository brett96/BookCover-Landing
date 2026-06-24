import { NextResponse } from "next/server";
import {
  isKnownProduct,
  deploymentAnalyticsProduct,
} from "@/lib/analytics-config";
import { recordUsageEvent, type SiteId } from "@/lib/tracking";
import { getDemoSessionFromCookies } from "@/lib/demo-session";

const SITES: SiteId[] = ["landing", "member", "agent"];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      product?: string;
      site?: SiteId;
      eventType?: string;
      path?: string;
      referrer?: string | null;
      visitorId?: string;
      sessionId?: string;
      properties?: Record<string, unknown>;
    };

    const productRaw = body.product?.trim().toLowerCase();
    const product =
      productRaw && isKnownProduct(productRaw)
        ? productRaw
        : deploymentAnalyticsProduct();

    const site =
      body.site && SITES.includes(body.site) ? body.site : "landing";

    const session = await getDemoSessionFromCookies();
    await recordUsageEvent(
      {
        product,
        site,
        eventType: body.eventType ?? "page_view",
        path: body.path,
        referrer: body.referrer,
        visitorId: body.visitorId,
        sessionId: body.sessionId,
        userId: session?.uid,
        email: session?.email,
        properties: body.properties,
      },
      req
    );
    const res = NextResponse.json({ ok: true });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e) {
    console.error("track", e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

/** CORS for cross-origin portal tracking */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
