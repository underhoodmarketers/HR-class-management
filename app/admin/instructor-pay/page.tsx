import Link from "next/link";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, instructorPayouts, locations, users } from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import { markInstructorPayout } from "@/app/actions/admin";
import {
  formatDay,
  formatTime,
  formatMoney,
  fromStudioTime,
  studioDateKey,
  parseMonthKey,
  shiftMonthKey,
  monthLabel,
  INSTRUCTOR_RATE_CENTS,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

const RATE_CENTS = INSTRUCTOR_RATE_CENTS;

type GroupBy = "instructor" | "location";

function buildUrl(base: Record<string, string | undefined>, overrides: Record<string, string>) {
  const params = new URLSearchParams(
    Object.entries({ ...base, ...overrides }).filter(([, v]) => v) as [string, string][]
  );
  return `/admin/instructor-pay?${params.toString()}`;
}

export default async function InstructorPayPage({
  searchParams,
}: {
  searchParams: { month?: string; saved?: string; view?: string; id?: string };
}) {
  await requireAdmin();

  const now = new Date();
  const todayKey = studioDateKey(now);
  const monthKey = parseMonthKey(searchParams.month, todayKey.slice(0, 7));
  const monthStart = fromStudioTime(`${monthKey}-01T00:00`);
  const monthEnd = fromStudioTime(`${shiftMonthKey(monthKey, 1)}-01T00:00`);
  const prevMonth = shiftMonthKey(monthKey, -1);
  const nextMonth = shiftMonthKey(monthKey, 1);
  const groupBy: GroupBy = searchParams.view === "location" ? "location" : "instructor";

  const [instructors, allLocations, sessions, payouts] = await Promise.all([
    db.query.users.findMany({
      where: eq(users.role, "instructor"),
      orderBy: (u, { asc }) => [asc(u.name)],
    }),
    db.query.locations.findMany({
      orderBy: (l, { asc }) => [asc(l.name)],
    }),
    db.query.classSessions.findMany({
      where: and(gte(classSessions.startsAt, monthStart), lt(classSessions.startsAt, monthEnd)),
      with: { classType: true, location: true },
      orderBy: [classSessions.startsAt],
    }),
    db.query.instructorPayouts.findMany({
      where: eq(instructorPayouts.month, monthKey),
    }),
  ]);

  const payoutByInstructor = new Map(payouts.map((p) => [p.instructorId, p]));

  // A session belongs to an instructor if their account is directly
  // assigned, or — for older/manually-entered classes — the free-text
  // instructor label matches their name (no linked account was set).
  const sessionsFor = (instructor: (typeof instructors)[number]) =>
    sessions.filter(
      (s) =>
        s.assignedInstructorId === instructor.id ||
        (!s.assignedInstructorId && s.instructor?.trim().toLowerCase() === instructor.name.trim().toLowerCase())
    );

  const rows = instructors
    .map((instructor) => {
      const mySessions = sessionsFor(instructor).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      // Only classes that have actually happened count toward pay — a
      // scheduled-but-not-yet-run class isn't "completed" yet.
      const completedCount = mySessions.filter((s) => !s.canceled && s.startsAt < now).length;
      const totalCents = completedCount * RATE_CENTS;
      const payout = payoutByInstructor.get(instructor.id);
      return { instructor, sessions: mySessions, completedCount, totalCents, payout };
    })
    .filter((r) => r.sessions.length > 0);

  const grandTotalCents = rows.reduce((sum, r) => sum + r.totalCents, 0);

  // Same per-instructor pay data, just regrouped so each studio shows who
  // taught there and what's owed to them for those classes specifically —
  // due/paid is still tracked per instructor per month (not per studio), so
  // marking paid from here affects that instructor's whole month either way.
  const locationGroups = allLocations
    .map((location) => {
      const entries = rows
        .map((r) => ({
          ...r,
          sessions: r.sessions.filter((s) => s.locationId === location.id),
        }))
        .map((r) => ({
          ...r,
          completedCount: r.sessions.filter((s) => !s.canceled && s.startsAt < now).length,
        }))
        .filter((r) => r.sessions.length > 0);
      const locationTotalCents = entries.reduce((sum, e) => sum + e.completedCount * RATE_CENTS, 0);
      return { location, entries, locationTotalCents };
    })
    .filter((g) => g.entries.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-600">Instructor pay</h1>
          <p className="text-sm text-ink/50">Classes taught, computed from class assignments.</p>
        </div>
        <Link href="/admin/instructors" className="text-sm text-magenta">← Instructors</Link>
      </div>

      {searchParams.saved ? (
        <div className="rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep">
          Saved.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="font-600">{monthLabel(monthKey)}</h2>
        <div className="flex items-center gap-1.5">
          <Link
            href={buildUrl(searchParams, { month: prevMonth, id: "" })}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            ‹
          </Link>
          <Link
            href={buildUrl(searchParams, { month: todayKey.slice(0, 7), id: "" })}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            This month
          </Link>
          <Link
            href={buildUrl(searchParams, { month: nextMonth, id: "" })}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-sm text-ink/50">Total owed this month</p>
        <p className="mt-1 font-display text-3xl font-600 text-magenta">{formatMoney(grandTotalCents)}</p>
      </div>

      <div className="flex gap-1.5 border-b border-ink/5 pb-3">
        {(["instructor", "location"] as const).map((v) => (
          <Link
            key={v}
            href={buildUrl(searchParams, { view: v === "location" ? "location" : "", id: "" })}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              groupBy === v ? "bg-magenta text-white" : "bg-blush/40 text-ink/60 hover:bg-blush"
            }`}
          >
            By {v === "instructor" ? "instructor" : "studio"}
          </Link>
        ))}
      </div>

      {groupBy === "instructor" ? (
        rows.length === 0 ? (
          <div className="card p-8 text-center text-ink/40">No classes assigned this month.</div>
        ) : (
          (() => {
            const selectedId = searchParams.id ? Number(searchParams.id) : rows[0].instructor.id;
            const active = rows.find((r) => r.instructor.id === selectedId) ?? rows[0];
            return (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {rows.map((r) => (
                    <Link
                      key={r.instructor.id}
                      href={buildUrl(searchParams, { id: String(r.instructor.id) })}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        r.instructor.id === active.instructor.id
                          ? "bg-magenta text-white"
                          : "bg-blush/40 text-ink/60 hover:bg-blush"
                      }`}
                    >
                      {r.instructor.name}{" "}
                      <span className={r.instructor.id === active.instructor.id ? "text-white/80" : "text-ink/40"}>
                        ({formatMoney(r.totalCents)})
                      </span>
                    </Link>
                  ))}
                </div>
                <InstructorPayCard
                  instructorId={active.instructor.id}
                  name={active.instructor.name}
                  sessions={active.sessions}
                  completedCount={active.completedCount}
                  totalCents={active.totalCents}
                  payout={active.payout}
                  monthKey={monthKey}
                  now={now}
                  showLocation
                />
              </>
            );
          })()
        )
      ) : locationGroups.length === 0 ? (
        <div className="card p-8 text-center text-ink/40">No classes assigned this month.</div>
      ) : (
        (() => {
          const selectedId = searchParams.id ? Number(searchParams.id) : locationGroups[0].location.id;
          const active = locationGroups.find((g) => g.location.id === selectedId) ?? locationGroups[0];
          return (
            <>
              <div className="flex flex-wrap gap-1.5">
                {locationGroups.map((g) => (
                  <Link
                    key={g.location.id}
                    href={buildUrl(searchParams, { view: "location", id: String(g.location.id) })}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      g.location.id === active.location.id
                        ? "bg-magenta text-white"
                        : "bg-blush/40 text-ink/60 hover:bg-blush"
                    }`}
                  >
                    {g.location.name}{" "}
                    <span className={g.location.id === active.location.id ? "text-white/80" : "text-ink/40"}>
                      ({formatMoney(g.locationTotalCents)})
                    </span>
                  </Link>
                ))}
              </div>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-lg font-600">{active.location.name}</h3>
                  <p className="text-sm text-ink/50">{formatMoney(active.locationTotalCents)}</p>
                </div>
                {active.entries.map(({ instructor, sessions: mySessions, completedCount, totalCents, payout }) => (
                  <InstructorPayCard
                    key={instructor.id}
                    instructorId={instructor.id}
                    name={instructor.name}
                    sessions={mySessions}
                    completedCount={completedCount}
                    totalCents={totalCents}
                    payout={payout}
                    monthKey={monthKey}
                    now={now}
                    showLocation={false}
                  />
                ))}
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}

function InstructorPayCard({
  instructorId,
  name,
  sessions,
  completedCount,
  totalCents,
  payout,
  monthKey,
  now,
  showLocation,
}: {
  instructorId: number;
  name: string;
  sessions: {
    id: number;
    startsAt: Date;
    canceled: boolean;
    classType: { name: string };
    location: { name: string };
  }[];
  completedCount: number;
  totalCents: number;
  payout?: { status: string; comments: string | null };
  monthKey: string;
  now: Date;
  showLocation: boolean;
}) {
  const status = payout?.status ?? "due";
  return (
    <div className="card p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-600">{name}</p>
          <p className="text-sm text-ink/50">
            {completedCount} class{completedCount === 1 ? "" : "es"} · {formatMoney(totalCents)}
          </p>
        </div>
        <span
          className={`badge ${
            status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {status === "paid" ? "Paid" : "Due"}
        </span>
      </div>

      <ul className="divide-y divide-ink/5 text-sm">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2">
            <span>{showLocation ? `${s.classType.name} · ${s.location.name}` : s.classType.name}</span>
            <span className="flex items-center gap-3 text-ink/50">
              {formatDay(s.startsAt)} {formatTime(s.startsAt)}
              {s.canceled ? (
                <span className="badge bg-blush text-magenta-deep">Canceled</span>
              ) : s.startsAt >= now ? (
                <span className="badge bg-blush/60 text-ink/50">Upcoming</span>
              ) : (
                <span className="text-xs text-ink/40">{formatMoney(RATE_CENTS)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <form action={markInstructorPayout} className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-4">
        <input type="hidden" name="instructorId" value={instructorId} />
        <input type="hidden" name="month" value={monthKey} />
        <input
          name="comments"
          defaultValue={payout?.comments ?? ""}
          placeholder="Comments (e.g. $5 due)"
          className="input flex-1 min-w-[160px] py-1.5 text-sm"
        />
        <button type="submit" name="status" value="due" className="btn-subtle px-3 py-1.5 text-xs">
          Mark due
        </button>
        <button type="submit" name="status" value="paid" className="btn-primary px-3 py-1.5 text-xs">
          Mark paid
        </button>
      </form>
    </div>
  );
}
