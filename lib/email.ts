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
