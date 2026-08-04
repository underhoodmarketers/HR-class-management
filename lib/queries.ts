import "server-only";
import { and, eq, gt, desc } from "drizzle-orm";
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
