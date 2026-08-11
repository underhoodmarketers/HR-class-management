import Link from "next/link";
import { and, eq, gte, gt, lt, inArray, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, instructorLocations, users } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import {
  formatDay,
  formatTime,
  fromStudioTime,
  addStudioDays,
  studioWeekday,
  studioDateKey,
  parseMonthKey,
  shiftMonthKey,
  monthLabel,
} from "@/lib/utils";
import InstructorBookForm from "@/components/InstructorBookForm";

export const dynamic = "force-dynamic";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Roster({
  roster,
}: {
  roster: { id: number; name: string; contact: string }[];
}) {
  if (roster.length === 0) {
    return <p className="mt-3 border-t border-ink/5 pt-2 text-xs text-ink/40">Nobody booked yet.</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-ink/5 border-t border-ink/5 pt-2 text-sm">
      {roster.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-1.5">
          <span>{r.name}</span>
          <span className="text-xs text-ink/40">{r.contact}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function InstructorSchedulePage({
  searchParams,
}: {
  searchParams: { month?: string; day?: string };
}) {
  const session = await requireInstructor();

  const myLocations = await db.query.instructorLocations.findMany({
    where: eq(instructorLocations.userId, session.userId),
    with: { location: true },
  });
  const myLocationIds = myLocations.map((l) => l.locationId);

  const now = new Date();
  const todayKey = studioDateKey(now);
  const monthKey = parseMonthKey(searchParams.month, todayKey.slice(0, 7));
  const selectedDayKey =
    searchParams.day && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day)
      ? searchParams.day
      : todayKey;

  const monthStart = fromStudioTime(`${monthKey}-01T00:00`);
  const gridStart = addStudioDays(monthStart, -studioWeekday(monthStart));
  const GRID_DAYS = 42;
  const gridEnd = addStudioDays(gridStart, GRID_DAYS);

  const dayStart = fromStudioTime(`${selectedDayKey}T00:00`);
  const dayEnd = addStudioDays(dayStart, 1);

  const hasLocations = myLocationIds.length > 0;

  // A sentinel id when the instructor has no studios yet, so the queries
  // always run with a consistent shape (returning no rows) instead of
  // branching — keeps TypeScript's inference simple and the code shorter.
  const locationFilter = hasLocations ? myLocationIds : [-1];

  // A class with no specific instructor assigned is visible to any
  // instructor at that studio; otherwise it's visible only to the assignee.
  const visibleToMe = or(
    isNull(classSessions.assignedInstructorId),
    eq(classSessions.assignedInstructorId, session.userId)
  );

  const [upNext, gridSessions, agendaSessions, customers] = await Promise.all([
    db.query.classSessions.findFirst({
      where: and(
        inArray(classSessions.locationId, locationFilter),
        visibleToMe,
        gt(classSessions.startsAt, now),
        eq(classSessions.canceled, false)
      ),
      with: { classType: true, location: true, bookings: { with: { user: true } } },
      orderBy: [classSessions.startsAt],
    }),
    db.query.classSessions.findMany({
      where: and(
        inArray(classSessions.locationId, locationFilter),
        visibleToMe,
        gte(classSessions.startsAt, gridStart),
        lt(classSessions.startsAt, gridEnd)
      ),
      with: { classType: true },
      orderBy: [classSessions.startsAt],
    }),
    db.query.classSessions.findMany({
      where: and(
        inArray(classSessions.locationId, locationFilter),
        visibleToMe,
        gte(classSessions.startsAt, dayStart),
        lt(classSessions.startsAt, dayEnd)
      ),
      with: { classType: true, location: true, bookings: { with: { user: true } } },
      orderBy: [classSessions.startsAt],
    }),
    db.query.users.findMany({
      where: eq(users.role, "customer"),
      with: { locations: true },
      orderBy: (u, { asc }) => [asc(u.name)],
    }),
  ]);

  const myLocationIdSet = new Set(myLocationIds);
  const myCustomers = customers.filter((c) => c.locations.some((l) => myLocationIdSet.has(l.locationId)));

  const byDay = new Map<string, typeof gridSessions>();
  for (const s of gridSessions) {
    const key = studioDateKey(s.startsAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }

  const prevMonth = shiftMonthKey(monthKey, -1);
  const nextMonth = shiftMonthKey(monthKey, 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Schedule</h1>
        <p className="text-sm text-ink/50">Upcoming classes and who&apos;s booked in.</p>
      </div>

      {!hasLocations ? (
        <div className="card p-6 text-sm text-ink/50">
          You&apos;re not assigned to a studio yet. Ask an admin to assign one.
        </div>
      ) : (
        <>
          <div>
            <h2 className="mb-3 font-600">Up next</h2>
            {upNext ? (
              <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-9 w-1.5 shrink-0 rounded-full"
                      style={{ background: upNext.classType.color }}
                    />
                    <div>
                      <p className="font-600">{upNext.classType.name}</p>
                      <p className="text-xs text-ink/50">
                        {upNext.location.name} · {formatDay(upNext.startsAt)}{" "}
                        {formatTime(upNext.startsAt)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-ink/50">
                    {upNext.bookings.filter((b) => b.status === "booked").length}/
                    {upNext.capacity} booked
                  </span>
                </div>
                <Roster
                  roster={upNext.bookings
                    .filter((b) => b.status === "booked")
                    .map((b) => ({
                      id: b.id,
                      name: b.user.name,
                      contact: b.user.phone || b.user.email,
                    }))}
                />
                <InstructorBookForm
                  sessionId={upNext.id}
                  full={
                    upNext.bookings.filter((b) => b.status === "booked").length >=
                    upNext.capacity
                  }
                  bookableCustomers={myCustomers
                    .filter(
                      (c) =>
                        !upNext.bookings.some(
                          (b) => b.userId === c.id && b.status === "booked"
                        )
                    )
                    .map((c) => ({ id: c.id, name: c.name }))}
                />
              </div>
            ) : (
              <div className="card p-6 text-sm text-ink/40">Nothing upcoming.</div>
            )}
          </div>

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-600">{monthLabel(monthKey)}</h2>
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/instructor/schedule?month=${prevMonth}&day=${selectedDayKey}`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  ‹
                </Link>
                <Link
                  href={`/instructor/schedule?month=${todayKey.slice(0, 7)}&day=${todayKey}`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Today
                </Link>
                <Link
                  href={`/instructor/schedule?month=${nextMonth}&day=${selectedDayKey}`}
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
                    href={`/instructor/schedule?month=${monthKey}&day=${key}#agenda`}
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
                          title={`${formatTime(s.startsAt)} ${s.classType.name}`}
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

          <div id="agenda" className="scroll-mt-6 space-y-3">
            <h2 className="font-600">
              {formatDay(dayStart)}
              {selectedDayKey === todayKey ? (
                <span className="badge ml-2 bg-blush text-magenta-deep">Today</span>
              ) : null}
            </h2>

            {agendaSessions.length === 0 ? (
              <div className="card p-6 text-sm text-ink/40">Nothing scheduled this day.</div>
            ) : (
              agendaSessions.map((s) => (
                <div key={s.id} className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-9 w-1.5 shrink-0 rounded-full"
                        style={{ background: s.classType.color }}
                      />
                      <div>
                        <p className="font-600">
                          {s.classType.name}
                          {s.canceled ? (
                            <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink/50">
                              Canceled
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-ink/50">
                          {s.location.name} · {formatTime(s.startsAt)}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-ink/50">
                      {s.bookings.filter((b) => b.status === "booked").length}/{s.capacity} booked
                    </span>
                  </div>
                  <Roster
                    roster={s.bookings
                      .filter((b) => b.status === "booked")
                      .map((b) => ({
                        id: b.id,
                        name: b.user.name,
                        contact: b.user.phone || b.user.email,
                      }))}
                  />
                  {!s.canceled ? (
                    <InstructorBookForm
                      sessionId={s.id}
                      full={
                        s.bookings.filter((b) => b.status === "booked").length >= s.capacity
                      }
                      bookableCustomers={myCustomers
                        .filter(
                          (c) =>
                            !s.bookings.some(
                              (b) => b.userId === c.id && b.status === "booked"
                            )
                        )
                        .map((c) => ({ id: c.id, name: c.name }))}
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
