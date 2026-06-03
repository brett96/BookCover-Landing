import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

export function getSmtpTransport(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const user =
    process.env.SMTP_USER?.trim() || process.env.GMAIL_USER?.trim() || "";
  const pass = (
    process.env.SMTP_PASS ||
    process.env.GMAIL_APP_PASSWORD ||
    ""
  )
    .replace(/\s/g, "")
    .trim();

  if (!user || !pass) return null;

  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || "465");
    const secure =
      process.env.SMTP_SECURE !== undefined
        ? String(process.env.SMTP_SECURE).toLowerCase() === "true"
        : port === 465;

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  return transporter;
}

export function getSmtpFromAddress(): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.OTP_EMAIL_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    process.env.GMAIL_USER?.trim() ||
    "BookCover Demo <notifications@cercalabs.com>"
  );
}

export function isSmtpConfigured(): boolean {
  return getSmtpTransport() !== null;
}
