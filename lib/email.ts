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
