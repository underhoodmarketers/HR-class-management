import Link from "next/link";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, instructorPayouts, users } from "@/db/schema";
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
} from "@/lib/utils";

export const dynamic = "force-dynamic";

// Flat rate per completed class — matches the studio's actual pay practice
// (verified against a full year of manual payroll records). Bump this if
// that ever changes; per-instructor rates would need a schema field.
const RATE_CENTS = 2500;

export default async function InstructorPayPage({
  searchParams,
}: {
  searchParams: { month?: string; saved?: string };
}) {
  await requireAdmin();

  const now = new Date();
  const todayKey = studioDateKey(now);
  const monthKey = parseMonthKey(searchParams.month, todayKey.slice(0, 7));
  const monthStart = fromStudioTime(`${monthKey}-01T00:00`);
  const monthEnd = fromStudioTime(`${shiftMonthKey(monthKey, 1)}-01T00:00`);
  const prevMonth = shiftMonthKey(monthKey, -1);
  const nextMonth = shiftMonthKey(monthKey, 1);

  const [instructors, sessions, payouts] = await Promise.all([
    db.query.users.findMany({
      where: eq(users.role, "instructor"),
      orderBy: (u, { asc }) => [asc(u.name)],
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
          <Link href={`/admin/instructor-pay?month=${prevMonth}`} className="btn-ghost px-3 py-1.5 text-xs">
            ‹
          </Link>
          <Link href={`/admin/instructor-pay?month=${todayKey.slice(0, 7)}`} className="btn-ghost px-3 py-1.5 text-xs">
            This month
          </Link>
          <Link href={`/admin/instructor-pay?month=${nextMonth}`} className="btn-ghost px-3 py-1.5 text-xs">
            ›
          </Link>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-sm text-ink/50">Total owed this month</p>
        <p className="mt-1 font-display text-3xl font-600 text-magenta">{formatMoney(grandTotalCents)}</p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-ink/40">No classes assigned this month.</div>
      ) : (
        rows.map(({ instructor, sessions: mySessions, completedCount, totalCents, payout }) => {
          const status = payout?.status ?? "due";
          return (
            <div key={instructor.id} className="card p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-600">{instructor.name}</p>
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
                {mySessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span>
                      {s.classType.name} · {s.location.name}
                    </span>
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
                <input type="hidden" name="instructorId" value={instructor.id} />
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
        })
      )}
    </div>
  );
}
