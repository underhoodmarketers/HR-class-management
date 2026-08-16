import "server-only";
import { and, eq, gt, lte, desc, asc, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, packages, users } from "@/db/schema";
import { DROP_IN_PACKAGE_NAME } from "./utils";

export async function getActiveMembership(userId: number) {
  const now = new Date();
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.status, "active"),
      lte(memberships.startsAt, now),
      gt(memberships.endsAt, now)
    ),
    with: { package: { with: { locations: true } } },
    orderBy: [desc(memberships.endsAt)],
  });
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

/**
 * A customer can only ever be using one package at a time — if they buy a
 * new one while a real package is still active, the new one queues up and
 * starts the moment the current one ends, instead of overlapping it. A
 * Drop-In is exempt on both sides: buying one always starts immediately
 * regardless of what else is active, and an active Drop-In never blocks or
 * delays a real package purchase.
 */
export async function computeMembershipWindow(
  userId: number,
  durationDays: number,
  packageName: string
): Promise<{ startsAt: Date; endsAt: Date }> {
  const now = new Date();
  const current = packageName === DROP_IN_PACKAGE_NAME ? null : await findCurrentRealMembership(userId);
  const startsAt = current && current.package.name !== DROP_IN_PACKAGE_NAME ? current.endsAt : now;
  // durationDays counts the start day itself as day 1.
  const endsAt = new Date(startsAt.getTime() + (durationDays - 1) * 24 * 60 * 60 * 1000);
  return { startsAt, endsAt };
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
