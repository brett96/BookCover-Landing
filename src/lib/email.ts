import { getSmtpFromAddress, getSmtpTransport, isSmtpConfigured } from "@/lib/email/smtp";

async function sendHtmlEmail(
  to: string | string[],
  subject: string,
  html: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const transport = getSmtpTransport();
  if (!transport) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[dev] Email to ${Array.isArray(to) ? to.join(",") : to}: ${subject}`);
      console.info(html);
      return { ok: true };
    }
    return { ok: false, error: "SMTP is not configured" };
  }
  try {
    await transport.sendMail({
      from: getSmtpFromAddress(),
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send email",
    };
  }
}

export async function sendOtpEmail(
  to: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSmtpConfigured() && process.env.NODE_ENV === "development") {
    console.info(`[dev] OTP for ${to}: ${code}`);
    return { ok: true };
  }
  return sendHtmlEmail(
    to,
    "Your BookCover demo verification code",
    `
      <p>Your one-time verification code is:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>
      <p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
    `
  );
}

export async function sendReportEmail(
  to: string[],
  subject: string,
  html: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendHtmlEmail(to, subject, html);
}
