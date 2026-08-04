"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  classSessions,
  classTypes,
  locations,
  packages,
  packageLocations,
  waiverTemplate,
} from "@/db/schema";
import { requireAdmin } from "@/lib/guards";

// ---------- Class sessions ----------
export async function createSession(formData: FormData) {
  await requireAdmin();
  const classTypeId = Number(formData.get("classTypeId"));
  const locationId = Number(formData.get("locationId"));
  const start = new Date(String(formData.get("startsAt")));
  const durationMin = Number(formData.get("durationMin") || 60);
  const capacity = Number(formData.get("capacity") || 20);
  const instructor = String(formData.get("instructor") || "") || null;
  const repeatWeeks = Math.max(1, Math.min(52, Number(formData.get("repeatWeeks") || 1)));

  if (!classTypeId || !locationId || isNaN(start.getTime())) return;

  const rows = [];
  for (let i = 0; i < repeatWeeks; i++) {
    const s = new Date(start.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const e = new Date(s.getTime() + durationMin * 60 * 1000);
    rows.push({
      classTypeId,
      locationId,
      startsAt: s,
      endsAt: e,
      capacity,
      instructor,
    });
  }
  await db.insert(classSessions).values(rows);
  revalidatePath("/admin/calendar");
}

export async function cancelSession(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db.update(classSessions).set({ canceled: true }).where(eq(classSessions.id, id));
  revalidatePath("/admin/calendar");
}

export async function deleteSession(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db.delete(classSessions).where(eq(classSessions.id, id));
  revalidatePath("/admin/calendar");
}

// ---------- Locations ----------
export async function createLocation(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const address = String(formData.get("address") || "") || null;
  if (!name) return;
  await db.insert(locations).values({ name, address });
  revalidatePath("/admin/locations");
}

export async function toggleLocation(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db
    .update(locations)
    .set({ active: sql`NOT ${locations.active}` })
    .where(eq(locations.id, id));
  revalidatePath("/admin/locations");
}

// ---------- Class types ----------
export async function createClassType(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const color = String(formData.get("color") || "#C2185B");
  const description = String(formData.get("description") || "") || null;
  if (!name) return;
  await db.insert(classTypes).values({ name, color, description });
  revalidatePath("/admin/locations");
}

// ---------- Packages ----------
export async function createPackage(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "") || null;
  const priceCents = Math.round(Number(formData.get("price") || 0) * 100);
  const unlimited = formData.get("unlimited") === "on";
  const credits = unlimited ? null : Number(formData.get("credits") || 0) || null;
  const durationDays = Number(formData.get("durationDays") || 30);
  const locationIds = formData.getAll("locationIds").map((v) => Number(v));

  if (!name || priceCents < 0) return;

  const [pkg] = await db
    .insert(packages)
    .values({ name, description, priceCents, credits, durationDays })
    .returning();

  if (locationIds.length) {
    await db
      .insert(packageLocations)
      .values(locationIds.map((locationId) => ({ packageId: pkg.id, locationId })));
  }
  revalidatePath("/admin/packages");
  revalidatePath("/portal/packages");
}

export async function togglePackage(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db
    .update(packages)
    .set({ active: sql`NOT ${packages.active}` })
    .where(eq(packages.id, id));
  revalidatePath("/admin/packages");
  revalidatePath("/portal/packages");
}

// ---------- Waiver ----------
export async function updateWaiver(formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!title || !body) return;

  const current = await db.query.waiverTemplate.findFirst();
  if (current) {
    await db
      .update(waiverTemplate)
      .set({ title, body, version: current.version + 1, updatedAt: new Date() })
      .where(eq(waiverTemplate.id, current.id));
  } else {
    await db.insert(waiverTemplate).values({ title, body, version: 1 });
  }
  revalidatePath("/admin/waiver");
}
