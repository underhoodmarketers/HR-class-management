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

/** A direct, personal email to one customer — "to" is the customer themselves. */
export async function sendSingleEmail(from: string, to: string, subject: string, body: string): Promise<void> {
  if (!emailConfigured()) {
    console.warn(`RESEND_API_KEY not set — skipped email to ${to}`);
    return;
  }
  const html = body
    .split("\n")
    .map((line) => `<p>${line.trim() ? line : "&nbsp;"}</p>`)
    .join("");
  await resend.emails.send({ from, to, subject, html });
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

export async function sendDropInInviteEmail(
  to: string,
  details: { friendName: string; inviterName: string; inviteUrl: string }
) {
  if (!emailConfigured()) {
    console.warn(`RESEND_API_KEY not set — skipped Drop-In invite email to ${to}`);
    return;
  }
  const { friendName, inviterName, inviteUrl } = details;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${inviterName} got you a Drop-In class at Holistic Rhythm`,
    html: `
      <p>Hi ${friendName},</p>
      <p><strong>${inviterName}</strong> picked up a Drop-In class for you at Holistic Rhythm!</p>
      <p><a href="${inviteUrl}">Finish setting up your account</a> to sign our liability waiver and book your class. This link is just for you — it creates your own login, separate from ${inviterName}'s.</p>
      <p>See you soon!</p>
    `,
  });
}

export async function sendMembershipReminderEmail(
  to: string,
  details: { name: string; packageName: string; endsAt: string; portalUrl: string }
) {
  if (!emailConfigured()) {
    console.warn(`RESEND_API_KEY not set — skipped expiry reminder email to ${to}`);
    return;
  }
  const { name, packageName, endsAt, portalUrl } = details;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your ${packageName} package expires in 7 days`,
    html: `
      <p>Hi ${name},</p>
      <p>Just a heads up — your <strong>${packageName}</strong> package expires on <strong>${endsAt}</strong>, one week from today.</p>
      <p><a href="${portalUrl}">Renew your package</a> to keep booking classes without a gap.</p>
      <p>See you in class!</p>
    `,
  });
}

export async function sendMembershipExpiredEmail(
  to: string,
  details: { name: string; packageName: string; portalUrl: string }
) {
  if (!emailConfigured()) {
    console.warn(`RESEND_API_KEY not set — skipped expired email to ${to}`);
    return;
  }
  const { name, packageName, portalUrl } = details;
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your ${packageName} package has expired`,
    html: `
      <p>Hi ${name},</p>
      <p>Your <strong>${packageName}</strong> package expires today, so you won't be able to book new classes until you renew.</p>
      <p><a href="${portalUrl}">Renew your package</a> to keep dancing with us.</p>
      <p>Hope to see you back soon!</p>
    `,
  });
}
