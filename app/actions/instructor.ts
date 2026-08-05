"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, classSessions, instructorLocations, memberships, users } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { getActiveMembership } from "@/lib/queries";

/**
 * Books a customer into a class from the instructor portal — e.g. a walk-in
 * during class. Only allowed for classes the instructor can actually see:
 * their assigned studio(s), and — if the class has a specific instructor
 * assigned — only that instructor. Otherwise mirrors adminBookClass: doesn't
 * require the customer's package to cover this studio, and still books them
 * with zero credits (just skips the deduction).
 */
export async function instructorBookClass(formData: FormData) {
  const session = await requireInstructor();
  const sessionId = Number(formData.get("sessionId"));
  const userId = Number(formData.get("userId"));
  if (!sessionId || !userId) return;

  const myLocations = await db.query.instructorLocations.findMany({
    where: eq(instructorLocations.userId, session.userId),
  });
  const myLocationIds = new Set(myLocations.map((l) => l.locationId));

  const classSession = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, sessionId),
    with: { bookings: true },
  });
  if (!classSession || classSession.canceled) return;
  if (!myLocationIds.has(classSession.locationId)) return;
  if (
    classSession.assignedInstructorId &&
    classSession.assignedInstructorId !== session.userId
  ) {
    return;
  }

  const alreadyBooked = classSession.bookings.some(
    (b) => b.userId === userId && b.status === "booked"
  );
  if (alreadyBooked) return;

  const bookedCount = classSession.bookings.filter((b) => b.status === "booked").length;
  if (bookedCount >= classSession.capacity) return;

  const active = await getActiveMembership(userId);
  const membershipId = active?.membership.id ?? null;

  // If the active membership's own credits are exhausted, borrow from the
  // makeup pool instead of skipping the deduction entirely.
  let fromMakeupCredit = false;
  if (active && active.membership.creditsRemaining !== null && active.membership.creditsRemaining <= 0) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { makeupCredits: true },
    });
    fromMakeupCredit = Boolean(user && user.makeupCredits > 0);
  }

  await db
    .insert(bookings)
    .values({ userId, sessionId, membershipId, status: "booked", fromMakeupCredit });

  if (fromMakeupCredit) {
    await db
      .update(users)
      .set({ makeupCredits: sql`${users.makeupCredits} - 1` })
      .where(eq(users.id, userId));
  } else if (active && active.membership.creditsRemaining !== null && active.membership.creditsRemaining > 0) {
    await db
      .update(memberships)
      .set({ creditsRemaining: sql`${memberships.creditsRemaining} - 1` })
      .where(eq(memberships.id, active.membership.id));
  }

  revalidatePath("/instructor/schedule");
  revalidatePath("/instructor");
}
