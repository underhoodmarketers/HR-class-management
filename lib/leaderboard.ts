import "server-only";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, locations, users } from "@/db/schema";
import { fromStudioTime, shiftMonthKey, studioDateKey, monthLabel } from "./utils";

export type LeaderboardRow = {
  userId: number;
  userName: string;
  locationNames: string;
  attended: number;
  possible: number;
  percent: number | null;
};

// "Attended" = a non-canceled booking for a class whose start time has
// already passed — there's no separate check-in step in this app.
//
// Each person's percentage is their combined attendance (any studio) as a
// share of the classes held this window at their own preferred studio(s) —
// so someone at a small studio with perfect attendance can rank above a
// high-volume attendee at a busier one.
async function computeLeaderboard(start: Date, end: Date): Promise<LeaderboardRow[]> {
  const now = new Date();
  const cappedEnd = end < now ? end : now;
  if (cappedEnd <= start) return [];

  const [customers, activeLocations, sessions] = await Promise.all([
    db.query.users.findMany({
      where: eq(users.role, "customer"),
      with: { locations: true },
    }),
    db
      .select()
      .from(locations)
      .where(and(eq(locations.active, true), isNull(locations.archivedAt))),
    db.query.classSessions.findMany({
      where: and(
        eq(classSessions.canceled, false),
        gte(classSessions.startsAt, start),
        lt(classSessions.startsAt, cappedEnd)
      ),
      with: { bookings: true },
    }),
  ]);

  const activeLocationIds = new Set(activeLocations.map((l) => l.id));
  const locationName = new Map(activeLocations.map((l) => [l.id, l.name]));
  const sessionsAtActiveLocations = sessions.filter((s) => activeLocationIds.has(s.locationId));

  const classesByLocation = new Map<number, number>();
  for (const s of sessionsAtActiveLocations) {
    classesByLocation.set(s.locationId, (classesByLocation.get(s.locationId) ?? 0) + 1);
  }

  const attendedByUser = new Map<number, number>();
  for (const s of sessionsAtActiveLocations) {
    for (const b of s.bookings) {
      if (b.status !== "booked") continue;
      attendedByUser.set(b.userId, (attendedByUser.get(b.userId) ?? 0) + 1);
    }
  }

  return customers
    .map((c) => {
      const locIds = [...new Set(c.locations.map((l) => l.locationId))].filter((id) =>
        activeLocationIds.has(id)
      );
      const possible = locIds.reduce((sum, id) => sum + (classesByLocation.get(id) ?? 0), 0);
      const attended = attendedByUser.get(c.id) ?? 0;
      const percent = possible > 0 ? Math.round((attended / possible) * 100) : null;
      return {
        userId: c.id,
        userName: c.name,
        locationNames: locIds.map((id) => locationName.get(id) ?? "").join(", "),
        attended,
        possible,
        percent,
      };
    })
    .filter((r) => r.attended > 0)
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || b.attended - a.attended);
}

export async function getCurrentMonthLeaderboard() {
  const todayKey = studioDateKey(new Date());
  const monthKey = todayKey.slice(0, 7);
  const start = fromStudioTime(`${monthKey}-01T00:00`);
  const end = fromStudioTime(`${shiftMonthKey(monthKey, 1)}-01T00:00`);
  const rows = await computeLeaderboard(start, end);
  return { monthKey, label: monthLabel(monthKey), rows };
}

export async function getLastMonthChampion() {
  const todayKey = studioDateKey(new Date());
  const currentMonthKey = todayKey.slice(0, 7);
  const monthKey = shiftMonthKey(currentMonthKey, -1);
  const start = fromStudioTime(`${monthKey}-01T00:00`);
  const end = fromStudioTime(`${currentMonthKey}-01T00:00`);
  const rows = await computeLeaderboard(start, end);
  return { monthKey, label: monthLabel(monthKey), champion: rows[0] ?? null };
}
