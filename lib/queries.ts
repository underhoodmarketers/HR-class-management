import "server-only";
import { and, eq, gt, desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { memberships } from "@/db/schema";

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
