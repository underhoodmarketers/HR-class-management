import Link from "next/link";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, instructorPayouts, users } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { fromStudioTime, studioDateKey, shiftMonthKey, formatMoney, monthLabel, INSTRUCTOR_RATE_CENTS } from "@/lib/utils";
import InstructorPayMonthDetail, { type MonthRow } from "@/components/InstructorPayMonthDetail";

export const dynamic = "force-dynamic";

export default async function InstructorPayPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await requireInstructor();
  const profile = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!profile) return null;

  const now = new Date();
  const todayKey = studioDateKey(now);
  const currentYear = todayKey.slice(0, 4);
  const currentMonthKey = todayKey.slice(0, 7);

  const monthKeys: string[] = [];
  for (let mk = `${currentYear}-01`; mk <= currentMonthKey; mk = shiftMonthKey(mk, 1)) {
    monthKeys.push(mk);
  }

  const yearStart = fromStudioTime(`${currentYear}-01-01T00:00`);
  const rangeEnd = fromStudioTime(`${shiftMonthKey(currentMonthKey, 1)}-01T00:00`);

  const [yearSessions, payouts] = await Promise.all([
    db.query.classSessions.findMany({
      where: and(gte(classSessions.startsAt, yearStart), lt(classSessions.startsAt, rangeEnd)),
      with: { classType: true, location: true },
      orderBy: [classSessions.startsAt],
    }),
    db.query.instructorPayouts.findMany({
      where: and(
        eq(instructorPayouts.instructorId, session.userId),
        inArray(instructorPayouts.month, monthKeys)
      ),
    }),
  ]);

  // Mirrors the admin instructor-pay page: a session belongs to this
  // instructor if their account is directly assigned, or — for
  // older/manually-entered classes — the free-text instructor label
  // matches their name (no linked account was set).
  const mySessions = yearSessions.filter(
    (s) =>
      s.assignedInstructorId === session.userId ||
      (!s.assignedInstructorId && s.instructor?.trim().toLowerCase() === profile.name.trim().toLowerCase())
  );

  const payoutByMonth = new Map(payouts.map((p) => [p.month, p]));

  const payMonths: MonthRow[] = monthKeys
    .map((monthKey) => {
      const monthStart = fromStudioTime(`${monthKey}-01T00:00`);
      const monthEnd = fromStudioTime(`${shiftMonthKey(monthKey, 1)}-01T00:00`);
      const sessionsThisMonth = mySessions
        .filter((s) => s.startsAt >= monthStart && s.startsAt < monthEnd)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      const completedCount = sessionsThisMonth.filter((s) => !s.canceled && s.startsAt < now).length;
      return {
        monthKey,
        sessions: sessionsThisMonth,
        completedCount,
        totalCents: completedCount * INSTRUCTOR_RATE_CENTS,
        payoutStatus: (payoutByMonth.get(monthKey)?.status as "due" | "paid" | undefined) ?? "due",
      };
    })
    .reverse(); // latest month first

  const activeMonthKey =
    searchParams.month && payMonths.some((m) => m.monthKey === searchParams.month)
      ? searchParams.month
      : payMonths[0]?.monthKey;
  const active = payMonths.find((m) => m.monthKey === activeMonthKey) ?? payMonths[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Pay</h1>
        <p className="text-sm text-ink/50">Classes taught each month, and what&apos;s due or already paid.</p>
      </div>

      {payMonths.length === 0 ? (
        <div className="card p-8 text-center text-ink/40">No classes assigned yet.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-ink/5 pb-3">
            {payMonths.map((m) => (
              <Link
                key={m.monthKey}
                href={`/instructor/pay?month=${m.monthKey}`}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  m.monthKey === active?.monthKey
                    ? "bg-magenta text-white"
                    : "bg-blush/40 text-ink/60 hover:bg-blush"
                }`}
              >
                {monthLabel(m.monthKey)}{" "}
                <span className={m.monthKey === active?.monthKey ? "text-white/80" : "text-ink/40"}>
                  ({formatMoney(m.totalCents)})
                </span>
              </Link>
            ))}
          </div>

          {active ? <InstructorPayMonthDetail month={active} now={now} /> : null}
        </>
      )}
    </div>
  );
}
