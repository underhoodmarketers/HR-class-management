"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql, count, and, lt, gte, inArray, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  classSessions,
  classTypes,
  instructorLocations,
  locations,
  memberships,
  packages,
  packageLocations,
  users,
  waiverSignatures,
  waiverTemplate,
  zellePayments,
  zelleSettings,
} from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import { hashPassword } from "@/lib/auth";
import { getActiveMembership } from "@/lib/queries";
import {
  fromStudioTime,
  addStudioWeeks,
  addStudioDays,
  studioWeekday,
  studioClock,
  withStudioClock,
} from "@/lib/utils";
import { randomUUID } from "crypto";
import { stripe, stripeConfigured } from "@/lib/stripe";

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

/**
 * The instructor picker submits an instructor account id — this resolves it
 * to the account (or null, for "no specific instructor"), so callers get
 * both the id to assign and the name to store as the display label.
 */
async function resolveInstructor(formData: FormData) {
  const instructorId = Number(formData.get("instructorId")) || null;
  if (!instructorId) return { assignedInstructorId: null, instructor: null };

  const row = await db.query.users.findFirst({
    where: and(eq(users.id, instructorId), eq(users.role, "instructor")),
    columns: { id: true, name: true },
  });
  return row
    ? { assignedInstructorId: row.id, instructor: row.name }
    : { assignedInstructorId: null, instructor: null };
}

// ---------- Class sessions ----------
export async function createSession(formData: FormData) {
  await requireAdmin();
  const classTypeId = Number(formData.get("classTypeId"));
  const locationId = Number(formData.get("locationId"));
  const startValue = String(formData.get("startsAt") || "");
  const start = fromStudioTime(startValue);
  const durationMin = Number(formData.get("durationMin") || 60);
  const capacity = Number(formData.get("capacity") || 20);
  const { instructor, assignedInstructorId } = await resolveInstructor(formData);

  // Optional: repeat weekly through this date. Blank = just the picked date(s), once.
  const endDateValue = String(formData.get("endDate") || "");
  const repeatUntil = endDateValue ? fromStudioTime(`${endDateValue}T23:59`) : null;

  // Optional extra weekdays: a series can run e.g. Mon + Wed each week.
  const extraDays = formData
    .getAll("weekdays")
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);

  if (
    !classTypeId ||
    !locationId ||
    isNaN(start.getTime()) ||
    (endDateValue && isNaN(repeatUntil!.getTime())) ||
    (repeatUntil && repeatUntil.getTime() < start.getTime())
  ) {
    redirect("/admin/calendar?error=invalid");
  }

  const startDay = studioWeekday(start);
  // If specific weekdays were checked, classes run only on those days —
  // NOT also on whatever weekday the start date happens to fall on. With
  // nothing checked, fall back to the start date's own weekday.
  const days = extraDays.length > 0 ? Array.from(new Set(extraDays)).sort() : [startDay];

  // Cap at a year of weekly classes so a mistyped far-future end date can't
  // create an unbounded number of rows.
  const maxWeeks = repeatUntil ? 52 : 1;

  const rows = [];
  for (const day of days) {
    // Roll forward (never backward) from the start date to that weekday's
    // first occurrence, e.g. picking a Monday start for a Tuesday class
    // aligns the first class to the following Tuesday, not the Monday.
    const forwardOffset = (day - startDay + 7) % 7;
    const firstOccurrence = addStudioDays(start, forwardOffset);

    for (let week = 0; week < maxWeeks; week++) {
      const s = addStudioWeeks(firstOccurrence, week);
      if (Number.isNaN(s.getTime())) continue;
      if (repeatUntil && s.getTime() > repeatUntil.getTime()) continue;
      rows.push({
        classTypeId,
        locationId,
        startsAt: s,
        endsAt: new Date(s.getTime() + durationMin * 60 * 1000),
        capacity,
        instructor,
        assignedInstructorId,
        seriesId: null as string | null,
      });
    }
  }

  const isSeries = rows.length > 1;
  if (isSeries) {
    const seriesId = randomUUID().slice(0, 36);
    for (const row of rows) row.seriesId = seriesId;
  }

  rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  await db.insert(classSessions).values(rows);
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  redirect(`/admin/calendar?created=${rows.length}`);
}

export async function editSession(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const scope = String(formData.get("scope") || "one"); // "one" | "series"
  const startValue = String(formData.get("startsAt") || "");
  const start = fromStudioTime(startValue);
  const durationMin = Number(formData.get("durationMin") || 60);
  const capacity = Number(formData.get("capacity") || 20);
  const { instructor, assignedInstructorId } = await resolveInstructor(formData);
  const locationId = Number(formData.get("locationId"));

  const existing = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, id),
  });
  if (!existing || Number.isNaN(start.getTime())) {
    redirect("/admin/calendar?error=invalid");
  }

  if (scope === "series" && existing.seriesId) {
    // Shift the whole remaining series by the same delta, preserving each
    // class's own date while applying the new time-of-day and details.
    const siblings = await db
      .select()
      .from(classSessions)
      .where(
        and(
          eq(classSessions.seriesId, existing.seriesId),
          gte(classSessions.startsAt, existing.startsAt)
        )
      );

    const newParts = studioClock(start);
    for (const sib of siblings) {
      const s = withStudioClock(sib.startsAt, newParts.hour, newParts.minute);
      await db
        .update(classSessions)
        .set({
          startsAt: s,
          endsAt: new Date(s.getTime() + durationMin * 60 * 1000),
          capacity,
          instructor,
          assignedInstructorId,
          locationId: locationId || sib.locationId,
        })
        .where(eq(classSessions.id, sib.id));
    }
    revalidatePath("/admin/calendar");
    revalidatePath("/admin");
    redirect(`/admin/calendar?updated=${siblings.length}`);
  }

  await db
    .update(classSessions)
    .set({
      startsAt: start,
      endsAt: new Date(start.getTime() + durationMin * 60 * 1000),
      capacity,
      instructor,
      assignedInstructorId,
      locationId: locationId || existing.locationId,
      // Editing a single class detaches it so future series edits skip it.
      seriesId: scope === "one" ? null : existing.seriesId,
    })
    .where(eq(classSessions.id, id));

  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  redirect("/admin/calendar?updated=1");
}

export async function deleteSeries(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const existing = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, id),
  });
  if (!existing?.seriesId) {
    redirect("/admin/calendar?error=not_series");
  }

  // Only remove this class and everything after it — past classes are history.
  const targets = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.seriesId, existing.seriesId),
        gte(classSessions.startsAt, existing.startsAt)
      )
    );

  const ids = targets.map((t) => t.id);
  const refunded = await refundBookingsForSessions(ids);
  await db.delete(classSessions).where(inArray(classSessions.id, ids));

  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  redirect(`/admin/calendar?deleted=${ids.length}&refunded=${refunded}`);
}

/**
 * Books a customer into a class on staff's behalf — e.g. for a phone or
 * walk-in booking. More permissive than the customer-facing bookClass:
 * doesn't require the customer's package to cover this studio, and still
 * books them even with zero credits (just skips the deduction). Capacity
 * and duplicate-booking checks still apply since those reflect real room
 * limits, not a paywall.
 */
export async function adminBookClass(formData: FormData) {
  await requireAdmin();
  const sessionId = Number(formData.get("sessionId"));
  const userId = Number(formData.get("userId"));
  if (!sessionId || !userId) return;

  const classSession = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, sessionId),
    with: { bookings: true },
  });
  if (!classSession || classSession.canceled) return;

  const alreadyBooked = classSession.bookings.some(
    (b) => b.userId === userId && b.status === "booked"
  );
  if (alreadyBooked) return;

  const bookedCount = classSession.bookings.filter((b) => b.status === "booked").length;
  if (bookedCount >= classSession.capacity) return;

  const active = await getActiveMembership(userId);
  const membershipId = active?.membership.id ?? null;

  await db.insert(bookings).values({ userId, sessionId, membershipId, status: "booked" });

  if (active && active.membership.creditsRemaining !== null && active.membership.creditsRemaining > 0) {
    await db
      .update(memberships)
      .set({ creditsRemaining: sql`${memberships.creditsRemaining} - 1` })
      .where(eq(memberships.id, active.membership.id));
  }

  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
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

  // Autopay is optional: both fields must be set together, or neither.
  const recurringPrice = Number(formData.get("recurringPrice") || 0);
  const billingWeeks = Number(formData.get("billingWeeks") || 0);
  const recurringPriceCents = recurringPrice > 0 && billingWeeks > 0 ? Math.round(recurringPrice * 100) : null;

  if (!name || priceCents < 0) return;

  const [pkg] = await db
    .insert(packages)
    .values({
      name,
      description,
      priceCents,
      credits,
      durationDays,
      recurringPriceCents,
      billingWeeks: recurringPriceCents ? billingWeeks : null,
    })
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

// ---------- Promo codes (Stripe coupons + promotion codes) ----------
export async function createPromoCode(formData: FormData) {
  await requireAdmin();
  if (!stripeConfigured()) {
    redirect("/admin/promo-codes?error=stripe_not_configured");
  }

  const code = String(formData.get("code") || "").trim().toUpperCase();
  const discountType = formData.get("discountType") === "amount" ? "amount" : "percent";
  const percentOff = Number(formData.get("percentOff") || 0);
  const amountOff = Number(formData.get("amountOff") || 0); // dollars
  const duration =
    formData.get("duration") === "forever"
      ? "forever"
      : formData.get("duration") === "repeating"
      ? "repeating"
      : "once";
  const durationMonths = Number(formData.get("durationMonths") || 0);
  const expiresAtValue = String(formData.get("expiresAt") || "");
  const maxRedemptions = Number(formData.get("maxRedemptions") || 0);

  const invalid =
    !code ||
    (discountType === "percent" && (!percentOff || percentOff <= 0 || percentOff > 100)) ||
    (discountType === "amount" && (!amountOff || amountOff <= 0)) ||
    (duration === "repeating" && (!durationMonths || durationMonths < 1));
  if (invalid) {
    redirect("/admin/promo-codes?error=invalid");
  }

  try {
    const coupon = await stripe.coupons.create({
      ...(discountType === "percent"
        ? { percent_off: percentOff }
        : { amount_off: Math.round(amountOff * 100), currency: "usd" }),
      duration,
      ...(duration === "repeating" ? { duration_in_months: durationMonths } : {}),
      name: code,
    });

    await stripe.promotionCodes.create({
      coupon: coupon.id,
      code,
      active: true,
      ...(expiresAtValue
        ? { expires_at: Math.floor(fromStudioTime(`${expiresAtValue}T23:59`).getTime() / 1000) }
        : {}),
      ...(maxRedemptions > 0 ? { max_redemptions: maxRedemptions } : {}),
    });
  } catch {
    // Most common cause: that code already exists on another active promotion.
    redirect("/admin/promo-codes?error=duplicate");
  }

  revalidatePath("/admin/promo-codes");
  redirect("/admin/promo-codes?created=1");
}

export async function togglePromoCode(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const active = formData.get("active") === "true";
  if (!id) return;
  await stripe.promotionCodes.update(id, { active: !active });
  revalidatePath("/admin/promo-codes");
}

// ---------- Customers ----------
export async function createCustomer(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const dob = String(formData.get("dob") || "");
  const instagram = String(formData.get("instagram") || "").trim().replace(/^@/, "") || null;
  const locationId = Number(formData.get("locationId"));
  const password = String(formData.get("password") || "");
  const signedName = String(formData.get("signedName") || "").trim();

  // Unlike self-signup, admin-added customers have no minimum age check —
  // this is the intended path for enrolling a minor with a guardian present.
  const invalid =
    name.length < 2 ||
    !email.includes("@") ||
    !phone ||
    !dob ||
    isNaN(Date.parse(dob)) ||
    !locationId ||
    password.length < 8 ||
    !signedName;
  if (invalid) {
    redirect("/admin/customers/new?error=invalid");
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    redirect("/admin/customers/new?error=exists");
  }

  const passwordHash = await hashPassword(password);
  const [customer] = await db
    .insert(users)
    .values({ email, passwordHash, name, phone, dob, instagram, locationId, role: "customer" })
    .returning();

  const template = await db.query.waiverTemplate.findFirst({
    orderBy: [desc(waiverTemplate.version)],
  });
  await db.insert(waiverSignatures).values({
    userId: customer.id,
    signedName,
    version: template?.version ?? 1,
  });

  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${customer.id}?created=1`);
}

export async function updateCustomer(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/customers?error=invalid");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const dob = String(formData.get("dob") || "");
  const instagram = String(formData.get("instagram") || "").trim().replace(/^@/, "") || null;
  const locationId = Number(formData.get("locationId"));

  const invalid =
    !id ||
    name.length < 2 ||
    !email.includes("@") ||
    !phone ||
    !dob ||
    isNaN(Date.parse(dob)) ||
    !locationId;
  if (invalid) {
    redirect(`/admin/customers/${id}?error=invalid`);
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing && existing.id !== id) {
    redirect(`/admin/customers/${id}?error=exists`);
  }

  await db
    .update(users)
    .set({ name, email, phone, dob, instagram, locationId })
    .where(and(eq(users.id, id), eq(users.role, "customer")));

  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${id}?updated=1`);
}

export async function deleteCustomer(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id) return;
  // Cascades their memberships, bookings, and waiver signature via FK.
  await db.delete(users).where(and(eq(users.id, id), eq(users.role, "customer")));
  revalidatePath("/admin/customers");
  redirect("/admin/customers?deleted=1");
}

// ---------- Instructors ----------
export async function createInstructor(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const password = String(formData.get("password") || "");
  const locationIds = formData
    .getAll("locationIds")
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  const invalid = name.length < 2 || !email.includes("@") || password.length < 8 || locationIds.length === 0;
  if (invalid) {
    redirect("/admin/instructors?error=invalid");
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    redirect("/admin/instructors?error=exists");
  }

  const passwordHash = await hashPassword(password);
  const [instructor] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
      phone: phone || null,
      role: "instructor",
    })
    .returning();

  await db
    .insert(instructorLocations)
    .values(locationIds.map((locationId) => ({ userId: instructor.id, locationId })));

  revalidatePath("/admin/instructors");
  redirect("/admin/instructors?created=1");
}

export async function deleteInstructor(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id) return;
  await db.delete(users).where(and(eq(users.id, id), eq(users.role, "instructor")));
  revalidatePath("/admin/instructors");
  redirect("/admin/instructors?deleted=1");
}

// ---------- Zelle payments ----------
export async function updateZelleSettings(formData: FormData) {
  await requireAdmin();
  const recipient = String(formData.get("recipient") || "").trim();
  const instructions = String(formData.get("instructions") || "").trim() || null;
  if (!recipient) {
    redirect("/admin/zelle?error=invalid");
  }

  const current = await db.query.zelleSettings.findFirst();
  if (current) {
    await db
      .update(zelleSettings)
      .set({ recipient, instructions, updatedAt: new Date() })
      .where(eq(zelleSettings.id, current.id));
  } else {
    await db.insert(zelleSettings).values({ recipient, instructions });
  }

  revalidatePath("/admin/zelle");
  revalidatePath("/portal/packages");
  redirect("/admin/zelle?saved=1");
}

export async function approveZellePayment(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id) return;

  const request = await db.query.zellePayments.findFirst({
    where: eq(zellePayments.id, id),
    with: { package: true },
  });
  if (!request || request.status !== "pending") return;

  const startsAt = new Date();
  const endsAt = new Date(
    startsAt.getTime() + request.package.durationDays * 24 * 60 * 60 * 1000
  );
  const [membership] = await db
    .insert(memberships)
    .values({
      userId: request.userId,
      packageId: request.packageId,
      status: "active",
      creditsRemaining: request.package.credits,
      startsAt,
      endsAt,
      billingType: "zelle",
    })
    .returning();

  await db
    .update(zellePayments)
    .set({ status: "approved", membershipId: membership.id, reviewedAt: new Date() })
    .where(eq(zellePayments.id, id));

  revalidatePath("/admin/zelle");
  revalidatePath("/portal/packages");
}

export async function rejectZellePayment(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id) return;
  await db
    .update(zellePayments)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(and(eq(zellePayments.id, id), eq(zellePayments.status, "pending")));
  revalidatePath("/admin/zelle");
  revalidatePath("/portal/packages");
}
