"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, classSessions, memberships } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { getActiveMembership } from "@/lib/queries";

export async function bookClass(formData: FormData) {
  const session = await requireUser();
  const sessionId = Number(formData.get("sessionId"));

  const active = await getActiveMembership(session.userId);
  if (!active) return;

  const { membership, allowedLocationIds } = active;

  const classSession = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, sessionId),
    with: { bookings: true },
  });
  if (!classSession || classSession.canceled) return;

  // Location must be allowed by the package (empty list = all studios).
  if (allowedLocationIds.length && !allowedLocationIds.includes(classSession.locationId)) {
    return;
  }

  // Already booked?
  const existing = classSession.bookings.find(
    (b) => b.userId === session.userId && b.status === "booked"
  );
  if (existing) return;

  // Capacity check.
  const bookedCount = classSession.bookings.filter((b) => b.status === "booked").length;
  if (bookedCount >= classSession.capacity) return;

  // Credit check (null credits = unlimited).
  if (membership.creditsRemaining !== null && membership.creditsRemaining <= 0) return;

  await db.insert(bookings).values({
    userId: session.userId,
    sessionId,
    membershipId: membership.id,
    status: "booked",
  });

  if (membership.creditsRemaining !== null) {
    await db
      .update(memberships)
      .set({ creditsRemaining: sql`${memberships.creditsRemaining} - 1` })
      .where(eq(memberships.id, membership.id));
  }

  revalidatePath("/portal/schedule");
  revalidatePath("/portal/bookings");
  revalidatePath("/portal");
}

export async function cancelBooking(formData: FormData) {
  const session = await requireUser();
  const bookingId = Number(formData.get("bookingId"));

  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, bookingId), eq(bookings.userId, session.userId)),
  });
  if (!booking || booking.status !== "booked") return;

  await db.update(bookings).set({ status: "canceled" }).where(eq(bookings.id, bookingId));

  // Refund the credit if one was used.
  if (booking.membershipId) {
    await db
      .update(memberships)
      .set({ creditsRemaining: sql`${memberships.creditsRemaining} + 1` })
      .where(
        and(
          eq(memberships.id, booking.membershipId),
          sql`${memberships.creditsRemaining} IS NOT NULL`
        )
      );
  }

  revalidatePath("/portal/schedule");
  revalidatePath("/portal/bookings");
  revalidatePath("/portal");
}
