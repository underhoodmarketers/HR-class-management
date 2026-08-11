import "server-only";
import { and, eq, gt, desc, asc, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";

export async function getActiveMembership(userId: number) {
  const now = new Date();
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.status, "active"),
      gt(memberships.endsAt, now)
    ),
    with: { package: { with: { locations: true } } },
    orderBy: [desc(memberships.endsAt)],
  });
  if (!membership) return null;

  const allowedLocationIds = membership.package.locations.map((l) => l.locationId);
  return { membership, allowedLocationIds };
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
 */
export async function rolloverUnusedCredits(userId: number): Promise<void> {
  const leftover = await db
    .select({ id: memberships.id, creditsRemaining: memberships.creditsRemaining })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), gt(memberships.creditsRemaining, 0)));
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
