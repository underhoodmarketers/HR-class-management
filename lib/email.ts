import "server-only";
import { Resend } from "resend";

const FROM_EMAIL = "Holistic Rhythm <team@myholisticrhythm.com>";

// Instantiated lazily so the app can boot without Resend configured yet.
const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!emailConfigured()) {
    console.warn(`RESEND_API_KEY not set — skipped password reset email to ${to}: ${resetUrl}`);
    return;
  }
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Reset your Holistic Rhythm password",
    html: `
      <p>Someone requested a password reset for your Holistic Rhythm account.</p>
      <p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

/**
 * Sends one message per batch of recipients, with the real addresses in
 * bcc (so nobody sees the rest of the list) and "to" set to the sender
 * itself. Batched to stay comfortably under email providers' per-message
 * recipient limits.
 */
export async function sendBulkEmail(
  from: string,
  recipients: string[],
  subject: string,
  body: string
): Promise<{ sent: number }> {
  if (!emailConfigured()) {
    console.warn(`RESEND_API_KEY not set — skipped bulk email to ${recipients.length} recipients`);
    return { sent: 0 };
  }
  if (recipients.length === 0) return { sent: 0 };

  const html = body
    .split("\n")
    .map((line) => `<p>${line.trim() ? line : "&nbsp;"}</p>`)
    .join("");

  const BATCH_SIZE = 45;
  let sent = 0;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    await resend.emails.send({ from, to: from, bcc: batch, subject, html });
    sent += batch.length;
  }
  return { sent };
}

export async function sendPackagePurchaseEmail(
  to: string,
  details: {
    name: string;
    packageName: string;
    credits: number | null; // null = unlimited
    priceCents: number;
    portalUrl: string;
  }
) {
  if (!emailConfigured()) {
    console.warn(`RESEND_API_KEY not set — skipped purchase confirmation email to ${to}`);
    return;
  }
  const { name, packageName, credits, priceCents, portalUrl } = details;
  const classesLine = credits === null ? "Unlimited classes" : `${credits} class${credits === 1 ? "" : "es"}`;
  const amount = (priceCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Payment confirmed — ${packageName}`,
    html: `
      <p>Hi ${name},</p>
      <p>Thanks for your purchase! Here's what you got:</p>
      <ul>
        <li><strong>Package:</strong> ${packageName}</li>
        <li><strong>Classes:</strong> ${classesLine}</li>
        <li><strong>Amount charged:</strong> ${amount}</li>
      </ul>
      <p><a href="${portalUrl}">Log in to your member portal</a> using this email address to book classes.</p>
      <p>A few things to know before your first class:</p>
      <ol>
        <li>Bring water, and wear comfy shoes and clothes.</li>
        <li>Come 5 minutes early to get situated.</li>
        <li>Book a class before you come — your package activates from the day of your first booked class, so there's no rush to use it before then.</li>
      </ol>
      <p>See you soon!</p>
    `,
  });
}
