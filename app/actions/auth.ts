"use server";

import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, waiverTemplate, waiverSignatures } from "@/db/schema";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
} from "@/lib/auth";

const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name."),
  email: z.string().email("Enter a valid email."),
  phone: z.string().optional(),
  emergencyContact: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  signedName: z.string().min(2, "Type your name to sign the waiver."),
  agree: z.string().refine((v) => v === "on", "You must accept the waiver to join."),
});

export async function signupAction(_prev: unknown, formData: FormData) {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
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
      phone: data.phone || null,
      emergencyContact: data.emergencyContact || null,
      role: "customer",
    })
    .returning();

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

  redirect("/portal");
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
    role: user.role as "admin" | "customer",
    name: user.name,
    email: user.email,
  });

  const dest = next && next.startsWith("/") ? next : user.role === "admin" ? "/admin" : "/portal";
  redirect(dest);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
