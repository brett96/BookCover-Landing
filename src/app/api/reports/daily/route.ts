import { NextResponse } from "next/server";
import { buildDailyReportHtml } from "@/lib/reports";
import { sendReportEmail } from "@/lib/email";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recipients = (process.env.REPORT_EMAIL_TO ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "REPORT_EMAIL_TO not configured" },
      { status: 503 }
    );
  }

  const html = await buildDailyReportHtml();
  const subject = `BookCover Demo Usage — ${new Date().toLocaleDateString("en-US")}`;
  const sent = await sendReportEmail(recipients, subject, html);
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sentTo: recipients });
}
