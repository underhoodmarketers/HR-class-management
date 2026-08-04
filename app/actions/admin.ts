"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql, count, and, lt, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  classSessions,
  classTypes,
  locations,
  packages,
  packageLocations,
  waiverTemplate,
} from "@/db/schema";
import { requireAdmin } from "@/lib/guards";

/**
 * Returns credits to members holding active bookings on the given sessions,
 * then marks those bookings canceled so a credit is never refunded twice.
 *
 * Unlimited memberships (creditsRemaining === null) are skipped — they have no
 * credit balance to restore.
 *
 * Must be called BEFORE deleting the sessions, since deleting a session
 * cascades its bookings away.
 */
async function refundBookingsForSessions(sessionIds: number[]) {
  if (sessionIds.length === 0) return 0;

  const affected = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(inArray(bookings.sessionId, sessionIds), eq(bookings.status, "booked"))
    );

  if (affected.length === 0) return 0;

  await db.execute(sql`
    UPDATE memberships m
    SET credits_remaining = m.credits_remaining + sub.refunds
    FROM (
      SELECT membership_id, COUNT(*)::int AS refunds
      FROM bookings
      WHERE session_id IN (${sql.join(
        sessionIds.map((id) => sql`${id}`),
        sql`, `
      )})
        AND status = 'booked'
        AND membership_id IS NOT NULL
      GROUP BY membership_id
    ) sub
    WHERE m.id = sub.membership_id
      AND m.credits_remaining IS NOT NULL
  `);

  await db
    .update(bookings)
    .set({ status: "canceled" })
    .where(
      and(inArray(bookings.sessionId, sessionIds), eq(bookings.status, "booked"))
    );

  return affected.length;
}

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
  // Members lose their spot, so give the credits back.
  await refundBookingsForSessions([id]);
  await db.update(classSessions).set({ canceled: true }).where(eq(classSessions.id, id));
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
}

export async function deleteSession(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  // Refund before deleting — the delete cascades bookings away.
  await refundBookingsForSessions([id]);
  await db.delete(classSessions).where(eq(classSessions.id, id));
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
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

export async function updateLocation(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const address = String(formData.get("address") || "").trim();
  if (!name) {
    redirect("/admin/locations?error=name_required");
  }
  await db
    .update(locations)
    .set({ name, address: address || null })
    .where(eq(locations.id, id));
  revalidatePath("/admin/locations");
  redirect("/admin/locations?saved=1");
}

export async function deleteLocation(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const now = new Date();

  // Past classes (and the bookings on them) are attendance history and must
  // survive. They still reference this studio, so the row can't always be
  // removed outright — clear everything upcoming, then decide.
  const [{ count: pastCount }] = await db
    .select({ count: count() })
    .from(classSessions)
    .where(
      and(eq(classSessions.locationId, id), lt(classSessions.startsAt, now))
    );

  // Refund credits for upcoming bookings BEFORE the sessions disappear.
  const future = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(
      and(eq(classSessions.locationId, id), gte(classSessions.startsAt, now))
    );
  const refunded = await refundBookingsForSessions(future.map((s) => s.id));

  // Deleting a session cascades to its bookings, releasing those future slots.
  const removed = await db
    .delete(classSessions)
    .where(
      and(eq(classSessions.locationId, id), gte(classSessions.startsAt, now))
    )
    .returning({ id: classSessions.id });

  // The studio should no longer be sellable through any package.
  await db.delete(packageLocations).where(eq(packageLocations.locationId, id));

  if (pastCount > 0) {
    // Keep the row so historic classes still resolve a studio name.
    await db
      .update(locations)
      .set({ active: false, archivedAt: now })
      .where(eq(locations.id, id));
  } else {
    // No history to protect — remove it entirely.
    await db.delete(locations).where(eq(locations.id, id));
  }

  revalidatePath("/admin/locations");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  redirect(
    `/admin/locations?${pastCount > 0 ? "archived" : "deleted"}=1&removed=${
      removed.length
    }&past=${pastCount}&refunded=${refunded}`
  );
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
