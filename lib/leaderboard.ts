import "server-only";
import { and, eq, gte, lt, count } from "drizzle-orm";
import { db } from "@/db";
import { bookings, classSessions, locations, users } from "@/db/schema";
import { fromStudioTime, shiftMonthKey, studioDateKey, monthLabel } from "./utils";

export type LeaderboardRow = { userId: number; userName: string; attended: number };
export type LocationBoard = { locationId: number; locationName: string; rows: LeaderboardRow[] };

// "Attended" = a non-canceled booking for a class whose start time has
// already passed — there's no separate check-in step in this app.
async function attendanceByLocation(start: Date, end: Date): Promise<LocationBoard[]> {
  const now = new Date();
  const cappedEnd = end < now ? end : now;

  const allLocations = await db.select().from(locations);
  const byLocation = new Map<number, LocationBoard>();
  for (const l of allLocations) {
    byLocation.set(l.id, { locationId: l.id, locationName: l.name, rows: [] });
  }

  if (cappedEnd <= start) {
    return Array.from(byLocation.values());
  }

  const rows = await db
    .select({
      locationId: locations.id,
      locationName: locations.name,
      userId: users.id,
      userName: users.name,
      attended: count(bookings.id),
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(locations, eq(classSessions.locationId, locations.id))
    .innerJoin(users, eq(bookings.userId, users.id))
    .where(
      and(
        eq(bookings.status, "booked"),
        eq(classSessions.canceled, false),
        gte(classSessions.startsAt, start),
        lt(classSessions.startsAt, cappedEnd)
      )
    )
    .groupBy(locations.id, locations.name, users.id, users.name);

  for (const r of rows) {
    const board = byLocation.get(r.locationId);
    if (board) board.rows.push({ userId: r.userId, userName: r.userName, attended: r.attended });
  }
  for (const board of byLocation.values()) {
    board.rows.sort((a, b) => b.attended - a.attended);
  }
  return Array.from(byLocation.values());
}

export async function getCurrentMonthLeaderboard() {
  const todayKey = studioDateKey(new Date());
  const monthKey = todayKey.slice(0, 7);
  const start = fromStudioTime(`${monthKey}-01T00:00`);
  const end = fromStudioTime(`${shiftMonthKey(monthKey, 1)}-01T00:00`);
  const boards = await attendanceByLocation(start, end);
  return { monthKey, label: monthLabel(monthKey), boards };
}

export async function getLastMonthWinners() {
  const todayKey = studioDateKey(new Date());
  const currentMonthKey = todayKey.slice(0, 7);
  const monthKey = shiftMonthKey(currentMonthKey, -1);
  const start = fromStudioTime(`${monthKey}-01T00:00`);
  const end = fromStudioTime(`${currentMonthKey}-01T00:00`);
  const boards = await attendanceByLocation(start, end);
  return {
    monthKey,
    label: monthLabel(monthKey),
    winners: boards
      .filter((b) => b.rows.length > 0)
      .map((b) => ({
        locationId: b.locationId,
        locationName: b.locationName,
        winner: b.rows[0],
      })),
  };
}
