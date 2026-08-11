"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, userLocations } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { createSession } from "@/lib/auth";

export async function updateProfile(formData: FormData) {
  const session = await requireUser();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const dob = String(formData.get("dob") || "");
  const instagram = String(formData.get("instagram") || "").trim().replace(/^@/, "") || null;
  const locationIds = formData
    .getAll("locationIds")
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  const invalid =
    name.length < 2 ||
    !email.includes("@") ||
    !phone ||
    !dob ||
    isNaN(Date.parse(dob)) ||
    locationIds.length === 0;
  if (invalid) {
    redirect("/portal/profile?error=invalid");
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing && existing.id !== session.userId) {
    redirect("/portal/profile?error=exists");
  }

  await db.update(users).set({ name, email, phone, dob, instagram }).where(eq(users.id, session.userId));
  await db.delete(userLocations).where(eq(userLocations.userId, session.userId));
  await db
    .insert(userLocations)
    .values(locationIds.map((locationId) => ({ userId: session.userId, locationId })));

  // Session cookie embeds name/email — re-issue so the UI and Stripe
  // checkout (which reads session.email) reflect the change immediately.
  await createSession({ userId: session.userId, role: session.role, name, email });

  revalidatePath("/portal/profile");
  revalidatePath("/portal");
  redirect("/portal/profile?updated=1");
}
