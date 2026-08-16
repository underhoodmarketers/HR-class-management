"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, classSessions, memberships, users } from "@/db/schema";
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

  // Purchased packages (not admin-added ones, which set dates deliberately)
  // don't start their clock until the customer's first booked class, so
  // nobody loses days sitting on an unbooked package.
  let isFirstBookingEver = false;
  if (["one_time", "recurring", "zelle"].includes(membership.billingType)) {
    const [{ count: priorBookings }] = await db
      .select({ count: count() })
      .from(bookings)
      .where(eq(bookings.membershipId, membership.id));
    isFirstBookingEver = priorBookings === 0;
  }

  // Credit check (null credits = unlimited). "auto" (the default, and the
  // only option when just one type is available) keeps the old waterfall:
  // draw from the package's own credits first, falling back to the
  // never-expiring makeup pool only once those run out. When both are
  // available, the customer can explicitly choose which to use.
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { makeupCredits: true },
  });
  const hasRegularCredit = membership.creditsRemaining === null || membership.creditsRemaining > 0;
  const hasMakeupCredit = Boolean(user && user.makeupCredits > 0);

  const creditSource = String(formData.get("creditSource") || "auto");
  let fromMakeupCredit = false;
  if (creditSource === "makeup") {
    if (!hasMakeupCredit) return;
    fromMakeupCredit = true;
  } else if (creditSource === "regular") {
    if (!hasRegularCredit) return;
    fromMakeupCredit = false;
  } else {
    if (!hasRegularCredit) {
      if (!hasMakeupCredit) return;
      fromMakeupCredit = true;
    }
  }

  await db.insert(bookings).values({
    userId: session.userId,
    sessionId,
    membershipId: membership.id,
    status: "booked",
    fromMakeupCredit,
  });

  if (fromMakeupCredit) {
    await db
      .update(users)
      .set({ makeupCredits: sql`${users.makeupCredits} - 1` })
      .where(eq(users.id, session.userId));
  } else if (membership.creditsRemaining !== null) {
    await db
      .update(memberships)
      .set({ creditsRemaining: sql`${memberships.creditsRemaining} - 1` })
      .where(eq(memberships.id, membership.id));
  }

  if (isFirstBookingEver) {
    const startsAt = new Date();
    // durationDays counts the start day itself as day 1.
    const endsAt = new Date(
      startsAt.getTime() + (membership.package.durationDays - 1) * 24 * 60 * 60 * 1000
    );
    await db.update(memberships).set({ startsAt, endsAt }).where(eq(memberships.id, membership.id));
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

  // Refund the credit to wherever it was drawn from.
  if (booking.fromMakeupCredit) {
    await db
      .update(users)
      .set({ makeupCredits: sql`${users.makeupCredits} + 1` })
      .where(eq(users.id, session.userId));
  } else if (booking.fromOwedCredit) {
    await db
      .update(users)
      .set({ creditsOwed: sql`GREATEST(0, ${users.creditsOwed} - 1)` })
      .where(eq(users.id, session.userId));
  } else if (booking.membershipId) {
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
