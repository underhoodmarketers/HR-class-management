"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, classSessions, instructorLocations, memberships, users, userLocations } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { getActiveMembership } from "@/lib/queries";
import { sendBulkEmail, sendSingleEmail } from "@/lib/email";
import { DROP_IN_PACKAGE_NAME } from "@/lib/utils";

/**
 * Books a customer into a class from the instructor portal — e.g. a walk-in
 * during class. Only allowed for classes assigned specifically to this
 * instructor. Otherwise mirrors adminBookClass: doesn't require the
 * customer's package to cover this studio, and a customer with no package
 * or no remaining credits can't be booked at all.
 */
export async function instructorBookClass(formData: FormData) {
  const session = await requireInstructor();
  const sessionId = Number(formData.get("sessionId"));
  const userId = Number(formData.get("userId"));
  if (!sessionId || !userId) return;

  const classSession = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, sessionId),
    with: { bookings: true },
  });
  if (!classSession || classSession.canceled) return;
  if (classSession.assignedInstructorId !== session.userId) return;

  const alreadyBooked = classSession.bookings.some(
    (b) => b.userId === userId && b.status === "booked"
  );
  if (alreadyBooked) return;

  const bookedCount = classSession.bookings.filter((b) => b.status === "booked").length;
  if (bookedCount >= classSession.capacity) return;

  // No package, or no credits left on it, means this customer can't be
  // booked at all.
  const active = await getActiveMembership(userId);
  if (!active) return;

  const membershipId = active.membership.id;
  const isDropIn = active.membership.package.name === DROP_IN_PACKAGE_NAME;
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { makeupCredits: true },
  });
  const hasRegularCredit =
    active.membership.creditsRemaining === null || active.membership.creditsRemaining > 0;
  const hasMakeupCredit = !isDropIn && Boolean(user && user.makeupCredits > 0);

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

  await db
    .insert(bookings)
    .values({ userId, sessionId, membershipId, status: "booked", fromMakeupCredit });

  if (fromMakeupCredit) {
    await db
      .update(users)
      .set({ makeupCredits: sql`${users.makeupCredits} - 1` })
      .where(eq(users.id, userId));
  } else if (active.membership.creditsRemaining !== null && active.membership.creditsRemaining > 0) {
    await db
      .update(memberships)
      .set({ creditsRemaining: sql`${memberships.creditsRemaining} - 1` })
      .where(eq(memberships.id, active.membership.id));
  }

  revalidatePath("/instructor/schedule");
  revalidatePath("/instructor");
}

/**
 * Cancels a single customer's booking (not the whole class) from the
 * instructor portal and refunds their credit to wherever it was drawn
 * from — mirrors adminCancelBooking, scoped to classes assigned
 * specifically to this instructor.
 */
export async function instructorCancelBooking(formData: FormData) {
  const session = await requireInstructor();
  const bookingId = Number(formData.get("bookingId"));
  if (!bookingId) return;

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: { session: true },
  });
  if (!booking || booking.status !== "booked") return;
  if (booking.session.assignedInstructorId !== session.userId) return;

  await db.update(bookings).set({ status: "canceled" }).where(eq(bookings.id, bookingId));

  if (booking.fromMakeupCredit) {
    await db
      .update(users)
      .set({ makeupCredits: sql`${users.makeupCredits} + 1` })
      .where(eq(users.id, booking.userId));
  } else if (booking.fromOwedCredit) {
    await db
      .update(users)
      .set({ creditsOwed: sql`GREATEST(0, ${users.creditsOwed} - 1)` })
      .where(eq(users.id, booking.userId));
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

  revalidatePath("/instructor/schedule");
  revalidatePath("/instructor");
}

export async function updateInstructorProfile(formData: FormData) {
  const session = await requireInstructor();
  const phone = String(formData.get("phone") || "").trim();
  const dob = String(formData.get("dob") || "");

  const invalid = !phone || !dob || isNaN(Date.parse(dob));
  if (invalid) {
    redirect("/instructor/profile?error=invalid");
  }

  await db.update(users).set({ phone, dob }).where(eq(users.id, session.userId));

  revalidatePath("/instructor/profile");
  redirect("/instructor/profile?updated=1");
}

/**
 * Sends from the instructor's own inbox (not the shared team@ address), so
 * their studio's customers see it as coming personally from them. Scoped to
 * only customers whose preferred studio matches one the instructor teaches
 * at — matches the same scoping used everywhere else in the instructor
 * portal. An optional customerIds selection narrows further to specific
 * people (still intersected with the studio scope server-side, regardless
 * of what the picker UI already filters to).
 */
export async function sendInstructorBulkEmail(formData: FormData) {
  const session = await requireInstructor();
  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const selectedIds = formData
    .getAll("customerIds")
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  if (!subject || !body) {
    redirect("/instructor?error=email_invalid");
  }

  const [instructor, myLocations] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, session.userId) }),
    db.query.instructorLocations.findMany({ where: eq(instructorLocations.userId, session.userId) }),
  ]);
  const locationIds = myLocations.map((l) => l.locationId);
  if (!instructor || locationIds.length === 0) {
    redirect("/instructor?error=email_no_recipients");
  }

  const customers = await db.query.users.findMany({
    where: and(
      eq(users.role, "customer"),
      inArray(
        users.id,
        db
          .select({ userId: userLocations.userId })
          .from(userLocations)
          .where(inArray(userLocations.locationId, locationIds))
      ),
      selectedIds.length > 0 ? inArray(users.id, selectedIds) : undefined
    ),
    columns: { email: true },
  });
  const recipients = customers.map((c) => c.email);
  if (recipients.length === 0) {
    redirect("/instructor?error=email_no_recipients");
  }

  const { sent } = await sendBulkEmail(`${instructor.name} <${instructor.email}>`, recipients, subject, body);

  redirect(`/instructor?email_sent=${sent}`);
}

/**
 * Emails a single customer, scoped to only customers at the instructor's
 * own studio(s) — same restriction as the bulk version, enforced
 * server-side regardless of what the customer list UI already filters to.
 */
export async function sendInstructorCustomerEmail(formData: FormData) {
  const session = await requireInstructor();
  const customerId = Number(formData.get("customerId"));
  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();

  if (!customerId || !subject || !body) {
    redirect("/instructor/customers?error=email_invalid");
  }

  const [instructor, myLocations] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, session.userId) }),
    db.query.instructorLocations.findMany({ where: eq(instructorLocations.userId, session.userId) }),
  ]);
  const locationIds = myLocations.map((l) => l.locationId);
  if (!instructor || locationIds.length === 0) {
    redirect("/instructor/customers?error=email_invalid");
  }

  const customer = await db.query.users.findFirst({
    where: and(
      eq(users.id, customerId),
      eq(users.role, "customer"),
      inArray(
        users.id,
        db
          .select({ userId: userLocations.userId })
          .from(userLocations)
          .where(inArray(userLocations.locationId, locationIds))
      )
    ),
  });
  if (!customer) {
    redirect("/instructor/customers?error=email_invalid");
  }

  await sendSingleEmail(`${instructor.name} <${instructor.email}>`, customer.email, subject, body);

  redirect("/instructor/customers?email_sent=1");
}
