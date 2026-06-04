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

export async function sendInquiryNotificationEmail(
  to: string,
  lead: {
    name: string;
    email: string;
    company: string;
    phone: string;
    role: string;
    message: string;
    submittedAt: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Company", lead.company || "—"],
    ["Phone", lead.phone || "—"],
    ["Role", lead.role || "—"],
    ["Message", lead.message || "—"],
    ["Submitted", lead.submittedAt],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;font-weight:600;color:#003087">${k}</td><td style="padding:6px 12px">${escapeHtml(String(v))}</td></tr>`
    )
    .join("");

  return sendHtmlEmail(
    to,
    `BookCover contact: ${lead.name}`,
    `
      <p>New interest form submission from the BookCover landing site.</p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows}</table>
    `
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
