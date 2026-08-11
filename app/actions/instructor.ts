"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, classSessions, instructorLocations, memberships, users, userLocations } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { getActiveMembership } from "@/lib/queries";
import { sendBulkEmail, sendSingleEmail } from "@/lib/email";

/**
 * Books a customer into a class from the instructor portal — e.g. a walk-in
 * during class. Only allowed for classes the instructor can actually see:
 * their assigned studio(s), and — if the class has a specific instructor
 * assigned — only that instructor. Otherwise mirrors adminBookClass: doesn't
 * require the customer's package to cover this studio, and if they have no
 * package or no remaining credits, it goes on their tab (creditsOwed).
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
  // makeup pool. No active membership, or an exhausted one with no makeup
  // credits either, goes on the customer's tab (repaid on their next
  // real purchase — see applyOwedCredits).
  let fromMakeupCredit = false;
  let fromOwedCredit = false;
  if (active && active.membership.creditsRemaining !== null && active.membership.creditsRemaining <= 0) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { makeupCredits: true },
    });
    fromMakeupCredit = Boolean(user && user.makeupCredits > 0);
    fromOwedCredit = !fromMakeupCredit;
  } else if (!active) {
    fromOwedCredit = true;
  }

  await db
    .insert(bookings)
    .values({ userId, sessionId, membershipId, status: "booked", fromMakeupCredit, fromOwedCredit });

  if (fromMakeupCredit) {
    await db
      .update(users)
      .set({ makeupCredits: sql`${users.makeupCredits} - 1` })
      .where(eq(users.id, userId));
  } else if (fromOwedCredit) {
    await db
      .update(users)
      .set({ creditsOwed: sql`${users.creditsOwed} + 1` })
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
