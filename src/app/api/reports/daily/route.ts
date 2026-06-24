import { NextResponse } from "next/server";
import { buildDailyReport } from "@/lib/reports";
import { getReportConfig } from "@/lib/report-config";
import { sendReportEmail } from "@/lib/email";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getReportConfig();
  const recipients = config.emailRecipients;
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No report recipients configured (set REPORT_EMAIL_TO or save recipients in admin)" },
      { status: 503 }
    );
  }

  const report = await buildDailyReport({
    config,
    dimensions: { product: "all", site: "all" },
  });
  const html = report.html;
  const subject = `BookCover Demo Usage — ${new Date().toLocaleDateString("en-US")}`;
  const sent = await sendReportEmail(recipients, subject, html);
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sentTo: recipients });
}
