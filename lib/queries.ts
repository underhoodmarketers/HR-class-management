import "server-only";
import { and, eq, gt, gte, lt, lte, desc, asc, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, packages, users, zellePayments, classSessions } from "@/db/schema";
import { DROP_IN_PACKAGE_NAME, addStudioDays, studioWeekday, studioDateKey, fromStudioTime } from "./utils";

/**
 * The membership to book against: the currently-started one if there is
 * one, otherwise (when `requireStarted: false`) the soonest queued future
 * one. Callers that pass a future membership are expected to also check
 * the specific class's date against `membership.startsAt` themselves,
 * since a queued package only covers classes on/after its own start date.
 * The strict default (`requireStarted: true`, i.e. only ever return an
 * already-started membership) is what most callers want.
 */
export async function getActiveMembership(userId: number, options: { requireStarted?: boolean } = {}) {
  const { requireStarted = true } = options;
  const now = new Date();

  const started = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.status, "active"),
      lte(memberships.startsAt, now),
      gt(memberships.endsAt, now)
    ),
    with: { package: { with: { locations: true } } },
    orderBy: [desc(memberships.endsAt)],
  });

  let membership = started;
  if (!membership && !requireStarted) {
    membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        gt(memberships.startsAt, now),
        gt(memberships.endsAt, now)
      ),
      with: { package: { with: { locations: true } } },
      orderBy: [asc(memberships.startsAt)],
    });
  }
  if (!membership) return null;

  const allowedLocationIds = membership.package.locations.map((l) => l.locationId);
  return { membership, allowedLocationIds };
}

/**
 * The customer's currently-in-use (real, non-Drop-In) package, if any —
 * status active, already started, and not yet ended. Shared by
 * rolloverUnusedCredits (to know what NOT to sweep) and
 * computeMembershipWindow (to know what a new purchase should queue behind).
 */
async function findCurrentRealMembership(userId: number) {
  const now = new Date();
  return db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.status, "active"),
      lte(memberships.startsAt, now),
      gt(memberships.endsAt, now)
    ),
    with: { package: { columns: { name: true } } },
    orderBy: [desc(memberships.endsAt)],
  });
}

/** A slot is one specific weekly commitment: this studio, on this weekday. */
export type AttendanceSlot = { locationId: number; weekday: number };

/**
 * A package's weekly class pace (1/2/3), derived from its own credits and
 * duration rather than its name — "Starter" always works out to 1/week,
 * "Momentum Builder" 2/week, "Power Progress" 3/week, but computing it this
 * way doesn't hardcode tier names.
 */
export function computePace(credits: number, durationDays: number): number {
  const weeks = durationDays / 7;
  return Math.max(1, Math.round(credits / weeks));
}

/**
 * Counts forward through the REAL scheduled (non-canceled) classes at the
 * chosen studio(s), on the specific weekday(s) the customer committed to,
 * starting from `startDate` — and returns the day after whichever real
 * class covers the package's final credit. This is what makes the end date
 * "correct" instead of a flat calendar-weeks estimate: cancellations, a
 * studio's actual weekly cadence, and multi-studio schedules all shift it
 * naturally, exactly the way a customer would actually use the credits.
 *
 * Falls back to a flat pace-based estimate if the real schedule doesn't
 * extend far enough into the future to find enough matching classes (e.g.
 * a new studio's series hasn't been created that far out yet) — so a
 * purchase never fails just because the calendar isn't fully populated.
 */
export async function computeScheduleEndDate(
  slots: AttendanceSlot[],
  startDate: Date,
  totalCredits: number
): Promise<Date> {
  const locationIds = [...new Set(slots.map((s) => s.locationId))];
  const slotKeys = new Set(slots.map((s) => `${s.locationId}:${s.weekday}`));
  const horizon = addStudioDays(startDate, 400);

  const sessions = await db.query.classSessions.findMany({
    where: and(
      inArray(classSessions.locationId, locationIds),
      eq(classSessions.canceled, false),
      gte(classSessions.startsAt, startDate),
      lt(classSessions.startsAt, horizon)
    ),
    columns: { startsAt: true, locationId: true },
    orderBy: [classSessions.startsAt],
  });
  const matching = sessions.filter((s) => slotKeys.has(`${s.locationId}:${studioWeekday(s.startsAt)}`));

  const lastClassAt =
    matching.length >= totalCredits
      ? matching[totalCredits - 1].startsAt
      : // Not enough real classes on the books that far out — estimate using
        // the pace implied by however many slots were chosen per week.
        addStudioDays(startDate, Math.ceil((totalCredits / slots.length) * 7) - 1);

  const dayAfter = addStudioDays(lastClassAt, 1);
  return fromStudioTime(`${studioDateKey(dayAfter)}T23:59`);
}

/**
 * A customer can only ever be using one package at a time — if they buy a
 * new one while a real package is still active, the new one queues up and
 * starts the moment the current one ends, instead of overlapping it. A
 * Drop-In is exempt on both sides: buying one always starts immediately
 * regardless of what else is active, and an active Drop-In never blocks or
 * delays a real package purchase.
 *
 * `preferredStartsAt` is an explicit start date the customer picked at
 * checkout — honored as long as it doesn't create an overlap; the later of
 * the two always wins. When `slots` + `totalCredits` are given, the end
 * date is computed from the real schedule (see computeScheduleEndDate)
 * instead of a flat durationDays estimate.
 */
export async function computeMembershipWindow(
  userId: number,
  durationDays: number,
  packageName: string,
  preferredStartsAt?: Date | null,
  slots?: AttendanceSlot[] | null,
  totalCredits?: number | null
): Promise<{ startsAt: Date; endsAt: Date }> {
  const now = new Date();
  const current = packageName === DROP_IN_PACKAGE_NAME ? null : await findCurrentRealMembership(userId);
  const queueStartsAt = current && current.package.name !== DROP_IN_PACKAGE_NAME ? current.endsAt : now;
  const startsAt =
    preferredStartsAt && preferredStartsAt.getTime() > queueStartsAt.getTime()
      ? preferredStartsAt
      : queueStartsAt;

  if (slots && slots.length > 0 && totalCredits) {
    const endsAt = await computeScheduleEndDate(slots, startsAt, totalCredits);
    return { startsAt, endsAt };
  }

  // durationDays counts the start day itself as day 1.
  const endsAt = new Date(startsAt.getTime() + (durationDays - 1) * 24 * 60 * 60 * 1000);
  return { startsAt, endsAt };
}

/**
 * Which days of the week (0=Sun) a studio actually runs classes on, based
 * on the real upcoming schedule — the basis for restricting a start-date
 * picker to dates that are actually useful (e.g. Coppell only ever runs
 * Tuesdays and Saturdays). Empty if the studio has nothing scheduled yet.
 */
export async function getLocationClassWeekdays(locationId: number): Promise<number[]> {
  const now = new Date();
  const horizon = addStudioDays(now, 60);
  const sessions = await db.query.classSessions.findMany({
    where: and(
      eq(classSessions.locationId, locationId),
      eq(classSessions.canceled, false),
      gte(classSessions.startsAt, now),
      lt(classSessions.startsAt, horizon)
    ),
    columns: { startsAt: true },
  });
  const weekdays = new Set(sessions.map((s) => studioWeekday(s.startsAt)));
  return Array.from(weekdays).sort();
}

/**
 * The nearest date (studio time, "yyyy-mm-dd") on or after `from` that
 * falls on one of the given weekdays — the sensible default start date
 * when a customer doesn't pick one themselves. Null if there are no known
 * class days to match against.
 */
export function nearestMatchingDate(from: Date, weekdays: number[]): string | null {
  if (weekdays.length === 0) return null;
  const weekdaySet = new Set(weekdays);
  let d = from;
  for (let i = 0; i < 14; i++) {
    if (weekdaySet.has(studioWeekday(d))) return studioDateKey(d);
    d = addStudioDays(d, 1);
  }
  return null;
}

/** Every currently-active membership, not just the one used for booking. */
export async function getActiveMemberships(userId: number) {
  const now = new Date();
  return db.query.memberships.findMany({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.status, "active"),
      gt(memberships.endsAt, now)
    ),
    with: { package: true },
    orderBy: [asc(memberships.endsAt)],
  });
}

/**
 * Sweeps any unused (non-unlimited) credits sitting on a customer's existing
 * memberships into their never-expiring makeup credit pool, then zeroes
 * those memberships out so the same credits can't be used twice. Call this
 * right before creating a new membership for the customer — "any credits
 * left roll over when a new package is bought."
 *
 * Drop-In (trial) packages are excluded — a Drop-In is a standalone single
 * class good only within its own window, not a credit that carries forward.
 * The customer's currently-in-use membership (already started, not yet
 * ended) is also excluded — a new purchase now queues up behind it instead
 * of replacing it immediately, so it's still being used and its credits
 * aren't "leftover" yet.
 */
export async function rolloverUnusedCredits(userId: number): Promise<void> {
  const current = await findCurrentRealMembership(userId);

  const leftover = await db
    .select({ id: memberships.id, creditsRemaining: memberships.creditsRemaining })
    .from(memberships)
    .innerJoin(packages, eq(memberships.packageId, packages.id))
    .where(
      and(
        eq(memberships.userId, userId),
        gt(memberships.creditsRemaining, 0),
        ne(packages.name, DROP_IN_PACKAGE_NAME),
        current ? ne(memberships.id, current.id) : undefined
      )
    );
  if (leftover.length === 0) return;

  const total = leftover.reduce((sum, m) => sum + (m.creditsRemaining ?? 0), 0);

  await db
    .update(users)
    .set({ makeupCredits: sql`${users.makeupCredits} + ${total}` })
    .where(eq(users.id, userId));

  await db
    .update(memberships)
    .set({ creditsRemaining: 0 })
    .where(
      inArray(
        memberships.id,
        leftover.map((m) => m.id)
      )
    );
}

/**
 * Repays any classes the customer was checked into with no package or no
 * remaining credits (users.creditsOwed) out of a freshly granted batch of
 * credits, before that batch becomes the new membership's starting balance.
 * Call this right before inserting a new membership for a REAL purchase
 * (Stripe or Zelle) — admin-manual grants intentionally skip this so an
 * admin's typed-in credit count isn't silently altered.
 *
 * Unlimited packages (credits === null) simply clear the debt, since there's
 * no cap left to repay against.
 */
export async function applyOwedCredits(
  userId: number,
  credits: number | null
): Promise<number | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { creditsOwed: true },
  });
  const owed = user?.creditsOwed ?? 0;
  if (owed <= 0) return credits;

  if (credits === null) {
    await db.update(users).set({ creditsOwed: 0 }).where(eq(users.id, userId));
    return credits;
  }

  const applied = Math.min(owed, credits);
  await db
    .update(users)
    .set({ creditsOwed: sql`${users.creditsOwed} - ${applied}` })
    .where(eq(users.id, userId));
  return credits - applied;
}

/**
 * What a customer actually paid for a membership, in cents — the real
 * Zelle amount if that's how they paid (which can differ from the
 * package's list price), otherwise the package's list price as the best
 * available figure (a Stripe purchase's exact charged amount, net of any
 * promo code, isn't stored locally). Used by the trial-credit conversion so
 * the $-off code matches what actually came in rather than a fixed guess.
 */
export async function getAmountPaidCents(membership: {
  id: number;
  billingType: string;
  package: { priceCents: number };
}): Promise<number> {
  if (membership.billingType === "zelle") {
    const zellePayment = await db.query.zellePayments.findFirst({
      where: eq(zellePayments.membershipId, membership.id),
      columns: { amountCents: true },
    });
    if (zellePayment) return zellePayment.amountCents;
  }
  return membership.package.priceCents;
}

/**
 * Validates a customer-submitted set of attendance slots against reality —
 * each one's studio must actually be allowed for this package, and its
 * weekday must be one that studio really runs on. Shared by the Stripe and
 * Zelle purchase paths so a tampered request can't smuggle in a fake
 * schedule either way. Always empty for a Drop-In, which doesn't have a
 * weekly schedule concept.
 */
export async function resolveAttendanceSlots(
  pkg: { name: string; locations: { locationId: number }[] },
  rawSlots: AttendanceSlot[]
): Promise<AttendanceSlot[]> {
  if (pkg.name === DROP_IN_PACKAGE_NAME || rawSlots.length === 0) return [];
  const allowedLocationIds = pkg.locations.map((l) => l.locationId);
  const validated: AttendanceSlot[] = [];
  for (const slot of rawSlots) {
    const locationAllowed = allowedLocationIds.length === 0 || allowedLocationIds.includes(slot.locationId);
    if (!locationAllowed) continue;
    const weekdays = await getLocationClassWeekdays(slot.locationId);
    if (weekdays.includes(slot.weekday)) validated.push(slot);
  }
  return validated;
}

/**
 * A submitted start date is only honored if it's a real future date that
 * lands on one of the already-validated attendance slots' weekdays.
 */
export function resolveStartDate(slots: AttendanceSlot[], rawStartDate: string | undefined | null): string | null {
  if (slots.length === 0 || !rawStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawStartDate)) return null;
  const parsed = fromStudioTime(`${rawStartDate}T00:00`);
  const isFuture = studioDateKey(parsed) >= studioDateKey(new Date());
  const matchesAnySlot = slots.some((s) => s.weekday === studioWeekday(parsed));
  return isFuture && matchesAnySlot ? rawStartDate : null;
}
