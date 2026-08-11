"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { eq, desc, and, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, waiverTemplate, waiverSignatures, passwordResetTokens, userLocations } from "@/db/schema";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getSession,
} from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";

const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name."),
  email: z.string().email("Enter a valid email."),
  phone: z.string().min(1, "Enter your phone number."),
  dob: z
    .string()
    .min(1, "Enter your date of birth.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date of birth.")
    .refine((v) => {
      const d = new Date(v);
      return d <= new Date() && d.getFullYear() > 1900;
    }, "Enter a valid date of birth.")
    .refine((v) => {
      const d = new Date(v);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 18);
      return d <= cutoff;
    }, "You must be 18 or older to create an account. Please contact the studio to enroll a minor."),
  instagram: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  signedName: z.string().min(2, "Type your name to sign the waiver."),
  agree: z.string().refine((v) => v === "on", "You must accept the waiver to join."),
  next: z.string().optional(),
});

// Only allow same-site relative paths — rejects protocol-relative URLs
// (e.g. "//evil.com") that browsers would treat as an external redirect.
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export async function signupAction(_prev: unknown, formData: FormData) {
  // Multi-value checkbox fields don't survive Object.fromEntries (it keeps
  // only the last value per key), so pull locationIds out separately.
  const locationIds = formData
    .getAll("locationIds")
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  if (locationIds.length === 0) {
    return { error: "Choose at least one preferred studio." };
  }
  const data = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, data.email.toLowerCase()),
  });
  if (existing) {
    return { error: "An account with that email already exists. Try signing in." };
  }

  const passwordHash = await hashPassword(data.password);
  const [user] = await db
    .insert(users)
    .values({
      email: data.email.toLowerCase(),
      passwordHash,
      name: data.name,
      phone: data.phone,
      dob: data.dob,
      instagram: data.instagram?.trim().replace(/^@/, "") || null,
      role: "customer",
    })
    .returning();

  await db
    .insert(userLocations)
    .values(locationIds.map((locationId) => ({ userId: user.id, locationId })));

  // Record the waiver signature against the current template version.
  const template = await db.query.waiverTemplate.findFirst({
    orderBy: [desc(waiverTemplate.version)],
  });
  await db.insert(waiverSignatures).values({
    userId: user.id,
    signedName: data.signedName,
    version: template?.version ?? 1,
  });

  await createSession({
    userId: user.id,
    role: "customer",
    name: user.name,
    email: user.email,
  });

  redirect(safeNext(data.next) ?? "/portal");
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { email, password, next } = parsed.data;

  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }

  await createSession({
    userId: user.id,
    role: user.role as "admin" | "customer" | "instructor",
    name: user.name,
    email: user.email,
  });

  const home =
    user.role === "admin" ? "/admin" : user.role === "instructor" ? "/instructor" : "/portal";
  redirect(safeNext(next) ?? home);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// ---------- Change password (logged-in user, any role) ----------

export async function changePasswordAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const home =
    session.role === "admin"
      ? "/admin/profile"
      : session.role === "instructor"
      ? "/instructor/profile"
      : "/portal/profile";
  const redirectTo = safeNext(String(formData.get("redirectTo") || "")) ?? home;

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    redirect(`${redirectTo}?pwerror=current`);
  }
  if (newPassword.length < 8) {
    redirect(`${redirectTo}?pwerror=weak`);
  }
  if (newPassword !== confirmPassword) {
    redirect(`${redirectTo}?pwerror=confirm`);
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, session.userId));

  redirect(`${redirectTo}?pwupdated=1`);
}

// ---------- Forgot password (unauthenticated) ----------

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email."),
});

export async function requestPasswordResetAction(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email.toLowerCase()),
  });

  // Always report success, whether or not the email matches an account —
  // don't let this form be used to test which emails have accounts.
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.insert(passwordResetTokens).values({ userId: user.id, token, expiresAt });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      console.error("Failed to send password reset email:", err);
    }
  }

  return { success: true };
}

// ---------- Reset password (via emailed token) ----------

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters."),
  confirmPassword: z.string(),
});

export async function resetPasswordAction(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { token, password, confirmPassword } = parsed.data;
  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }

  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.token, token),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date())
    ),
  });
  if (!row) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  redirect("/login?reset=1");
}
