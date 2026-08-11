import Link from "next/link";
import { and, gte, lt, eq, isNull, count } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, classTypes, locations, users } from "@/db/schema";
import { createSession } from "@/app/actions/admin";
import {
  formatDay,
  formatTime,
  formatDateTimeLocalValue,
  fromStudioTime,
  addStudioDays,
  studioWeekday,
  studioDateKey,
  parseMonthKey,
  shiftMonthKey,
  monthLabel,
} from "@/lib/utils";
import WeekdayPicker from "@/components/WeekdayPicker";
import SessionRow from "@/components/SessionRow";

export const dynamic = "force-dynamic";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: {
    created?: string;
    updated?: string;
    deleted?: string;
    refunded?: string;
    error?: string;
    month?: string;
    day?: string;
  };
}) {
  const now = new Date();
  const todayKey = studioDateKey(now);
  const monthKey = parseMonthKey(searchParams.month, todayKey.slice(0, 7));
  const selectedDayKey =
    searchParams.day && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day)
      ? searchParams.day
      : todayKey;

  const monthStart = fromStudioTime(`${monthKey}-01T00:00`);
  const gridStart = addStudioDays(monthStart, -studioWeekday(monthStart));
  const GRID_DAYS = 42; // 6 full weeks
  const gridEnd = addStudioDays(gridStart, GRID_DAYS);

  const dayStart = fromStudioTime(`${selectedDayKey}T00:00`);
  const dayEnd = addStudioDays(dayStart, 1);

  const [types, studios, gridSessions, agendaSessions, customers, instructors] = await Promise.all([
    db.select().from(classTypes),
    db
      .select()
      .from(locations)
      .where(and(eq(locations.active, true), isNull(locations.archivedAt))),
    db.query.classSessions.findMany({
      where: and(
        gte(classSessions.startsAt, gridStart),
        lt(classSessions.startsAt, gridEnd)
      ),
      with: { classType: true, location: true },
      orderBy: [classSessions.startsAt],
    }),
    db.query.classSessions.findMany({
      where: and(
        gte(classSessions.startsAt, dayStart),
        lt(classSessions.startsAt, dayEnd)
      ),
      with: {
        classType: true,
        location: true,
        bookings: { with: { user: true, membership: { with: { package: true } } } },
      },
      orderBy: [classSessions.startsAt],
    }),
    db.query.users.findMany({
      where: eq(users.role, "customer"),
      orderBy: (u, { asc }) => [asc(u.name)],
    }),
    db.query.users.findMany({
      where: eq(users.role, "instructor"),
      with: { instructorLocations: { with: { location: true } } },
      orderBy: (u, { asc }) => [asc(u.name)],
    }),
  ]);

  const instructorNameById = new Map(instructors.map((i) => [i.id, i.name]));
  const instructorOptions = instructors.map((i) => ({
    id: i.id,
    name: i.name,
    studioNames: i.instructorLocations.map((il) => il.location.name).join(", "),
  }));

  const canSchedule = types.length > 0 && studios.length > 0;

  const byDay = new Map<string, typeof gridSessions>();
  for (const s of gridSessions) {
    const key = studioDateKey(s.startsAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }

  // "Remaining in series" (including this one) for each agenda session, used
  // to gate the series edit/delete buttons and label how many they affect.
  const seriesRemaining = await Promise.all(
    agendaSessions.map(async (s) => {
      if (!s.seriesId) return 0;
      const [{ c }] = await db
        .select({ c: count() })
        .from(classSessions)
        .where(
          and(
            eq(classSessions.seriesId, s.seriesId),
            gte(classSessions.startsAt, s.startsAt)
          )
        );
      return c;
    })
  );

  const banner =
    searchParams.error === "invalid"
      ? {
          tone: "error" as const,
          text: "Please pick a class, studio, and a valid start time.",
        }
      : searchParams.error === "not_series"
      ? { tone: "error" as const, text: "That class isn't part of a series." }
      : searchParams.created
      ? {
          tone: "ok" as const,
          text: `${searchParams.created} class${
            searchParams.created === "1" ? "" : "es"
          } added to your calendar.`,
        }
      : searchParams.updated
      ? {
          tone: "ok" as const,
          text: `${searchParams.updated} class${
            searchParams.updated === "1" ? "" : "es"
          } updated.`,
        }
      : searchParams.deleted
      ? {
          tone: "ok" as const,
          text: `${searchParams.deleted} class${
            searchParams.deleted === "1" ? "" : "es"
          } deleted. ${searchParams.refunded ?? 0} credit${
            searchParams.refunded === "1" ? "" : "s"
          } refunded.`,
        }
      : null;

  const prevMonth = shiftMonthKey(monthKey, -1);
  const nextMonth = shiftMonthKey(monthKey, 1);
  const prevDayKey = studioDateKey(addStudioDays(dayStart, -1));
  const nextDayKey = studioDateKey(addStudioDays(dayStart, 1));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Calendar</h1>
        <p className="text-sm text-ink/50">
          Schedule classes across your studios. All times are Central.
        </p>
      </div>

      {banner ? (
        <div
          className={
            banner.tone === "error"
              ? "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              : "rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep"
          }
        >
          {banner.text}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <div className="card h-fit p-6">
          <h2 className="mb-4 font-600">Schedule a class</h2>
          {canSchedule ? (
            <form action={createSession} className="space-y-4">
              <div>
                <label className="label">Class</label>
                <select name="classTypeId" className="input" required>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Studio</label>
                <select name="locationId" className="input" required>
                  {studios.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">First class starts at</label>
                <input
                  type="datetime-local"
                  name="startsAt"
                  className="input"
                  defaultValue={`${selectedDayKey}T09:00`}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Minutes</label>
                  <input
                    type="number"
                    name="durationMin"
                    defaultValue={60}
                    min={15}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Capacity</label>
                  <input
                    type="number"
                    name="capacity"
                    defaultValue={20}
                    min={1}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Instructor (optional)</label>
                <select name="instructorId" className="input" defaultValue="">
                  <option value="">No specific instructor</option>
                  {instructorOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.studioNames ? ` (${i.studioNames})` : ""}
                    </option>
                  ))}
                </select>
                {instructorOptions.length === 0 ? (
                  <p className="mt-1 text-xs text-ink/40">
                    No instructor accounts yet — add one on the{" "}
                    <a href="/admin/instructors" className="text-magenta">
                      Instructors
                    </a>{" "}
                    page.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="label">Repeat weekly until (optional)</label>
                <input type="date" name="endDate" className="input" />
                <p className="mt-1 text-xs text-ink/40">
                  Leave blank to schedule only this date. Otherwise, repeats
                  weekly through the date you pick here.
                </p>
              </div>

              <WeekdayPicker />

              <button className="btn-primary w-full">Add to calendar</button>
            </form>
          ) : (
            <p className="text-sm text-ink/50">
              Add at least one class and one studio first on the{" "}
              <a href="/admin/locations" className="text-magenta">
                Studios &amp; classes
              </a>{" "}
              page.
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-600">{monthLabel(monthKey)}</h2>
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/admin/calendar?month=${prevMonth}&day=${selectedDayKey}`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  ‹
                </Link>
                <Link
                  href={`/admin/calendar?month=${todayKey.slice(
                    0,
                    7
                  )}&day=${todayKey}`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Today
                </Link>
                <Link
                  href={`/admin/calendar?month=${nextMonth}&day=${selectedDayKey}`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  ›
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-ink/5 text-xs">
              {WEEKDAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="bg-blush/40 px-2 py-1.5 text-center font-semibold text-ink/50"
                >
                  {d}
                </div>
              ))}
              {Array.from({ length: GRID_DAYS }, (_, i) => {
                const cellDate = addStudioDays(gridStart, i);
                const key = studioDateKey(cellDate);
                const inMonth = key.slice(0, 7) === monthKey;
                const isToday = key === todayKey;
                const isSelected = key === selectedDayKey;
                const daySessions = (byDay.get(key) ?? []).sort(
                  (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
                );
                const visible = daySessions.slice(0, 3);
                const overflow = daySessions.length - visible.length;

                return (
                  <Link
                    key={key}
                    href={`/admin/calendar?month=${monthKey}&day=${key}#agenda`}
                    className={`flex min-h-[92px] flex-col gap-1 bg-white p-1.5 transition hover:bg-blush/30 ${
                      inMonth ? "" : "opacity-40"
                    } ${isSelected ? "ring-2 ring-inset ring-magenta" : ""}`}
                  >
                    <span
                      className={`text-[11px] font-semibold ${
                        isToday
                          ? "flex h-5 w-5 items-center justify-center rounded-full bg-magenta text-white"
                          : "text-ink/50"
                      }`}
                    >
                      {Number(key.slice(8))}
                    </span>
                    <div className="space-y-0.5">
                      {visible.map((s) => (
                        <div
                          key={s.id}
                          title={`${formatTime(s.startsAt)} ${s.classType.name} · ${s.location.name}`}
                          className={`truncate rounded border-l-2 bg-cream px-1 py-0.5 text-[10px] leading-tight ${
                            s.canceled ? "text-ink/30 line-through" : "text-ink/70"
                          }`}
                          style={{ borderColor: s.classType.color }}
                        >
                          {formatTime(s.startsAt)} {s.classType.name}
                        </div>
                      ))}
                      {overflow > 0 ? (
                        <div className="px-1 text-[10px] font-medium text-magenta">
                          +{overflow} more
                        </div>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div id="agenda" className="card scroll-mt-6 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-600">
                {formatDay(dayStart)}
                {selectedDayKey === todayKey ? (
                  <span className="badge ml-2 bg-blush text-magenta-deep">
                    Today
                  </span>
                ) : null}
              </h2>
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/admin/calendar?month=${prevDayKey.slice(
                    0,
                    7
                  )}&day=${prevDayKey}#agenda`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  ‹ Prev day
                </Link>
                <Link
                  href={`/admin/calendar?month=${nextDayKey.slice(
                    0,
                    7
                  )}&day=${nextDayKey}#agenda`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Next day ›
                </Link>
              </div>
            </div>

            {agendaSessions.length === 0 ? (
              <p className="text-sm text-ink/50">Nothing scheduled this day.</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {agendaSessions.map((s, i) => {
                  const activeBookings = s.bookings.filter(
                    (b) => b.status === "booked"
                  );
                  const cancelledBookings = s.bookings.filter(
                    (b) => b.status === "canceled"
                  );
                  const toRosterEntry = (b: (typeof s.bookings)[number]) => ({
                    bookingId: b.id,
                    userId: b.userId,
                    name: b.user.name,
                    contact: b.user.phone || b.user.email,
                    packageName: b.membership?.package.name ?? null,
                    signedUpAt: b.createdAt,
                  });

                  return (
                    <li key={s.id}>
                      <SessionRow
                        session={{
                          id: s.id,
                          startsAt: s.startsAt,
                          endsAt: s.endsAt,
                          capacity: s.capacity,
                          instructor: s.instructor,
                          assignedInstructorId: s.assignedInstructorId,
                          canceled: s.canceled,
                          seriesId: s.seriesId,
                          locationId: s.locationId,
                        }}
                        className={s.classType.name}
                        locationName={s.location.name}
                        locations={studios.map((l) => ({
                          id: l.id,
                          name: l.name,
                        }))}
                        instructors={instructorOptions}
                        assignedInstructorName={
                          s.assignedInstructorId
                            ? instructorNameById.get(s.assignedInstructorId) ?? null
                            : null
                        }
                        booked={activeBookings.length}
                        dayLabel={formatDay(s.startsAt)}
                        timeLabel={formatTime(s.startsAt)}
                        startValue={formatDateTimeLocalValue(s.startsAt)}
                        seriesRemaining={seriesRemaining[i]}
                        roster={activeBookings.map(toRosterEntry)}
                        cancelledRoster={cancelledBookings.map(toRosterEntry)}
                        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
