import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, instructorPayouts, users } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { fromStudioTime, studioDateKey, shiftMonthKey, INSTRUCTOR_RATE_CENTS } from "@/lib/utils";
import ChangePasswordCard from "@/components/ChangePasswordCard";
import EditInstructorDetailsCard from "@/components/EditInstructorDetailsCard";
import InstructorPayHistory, { type MonthRow } from "@/components/InstructorPayHistory";

export const dynamic = "force-dynamic";

// Pilot: pay history only shows for this instructor until it's reviewed and
// approved to roll out to everyone else.
const PAY_HISTORY_PILOT_INSTRUCTOR_IDS = [31]; // Prerna (instructor account)

const errorMessages: Record<string, string> = {
  invalid: "Fill in a phone number and date of birth.",
};

const pwErrorMessages: Record<string, string> = {
  current: "Your current password is incorrect.",
  weak: "New password must be at least 8 characters.",
  confirm: "New password and confirmation don't match.",
};

export default async function InstructorProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; updated?: string; pwerror?: string; pwupdated?: string };
}) {
  const session = await requireInstructor();
  const profile = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!profile) return null;

  let payMonths: MonthRow[] | null = null;
  const now = new Date();
  if (PAY_HISTORY_PILOT_INSTRUCTOR_IDS.includes(session.userId)) {
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

    payMonths = monthKeys.map((monthKey) => {
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
    }).reverse(); // latest month first
  }

  const banner =
    searchParams.error && errorMessages[searchParams.error]
      ? { tone: "error" as const, text: errorMessages[searchParams.error] }
      : searchParams.updated
      ? { tone: "ok" as const, text: "Details updated." }
      : null;

  const pwBanner =
    searchParams.pwerror && pwErrorMessages[searchParams.pwerror]
      ? { tone: "error" as const, text: pwErrorMessages[searchParams.pwerror] }
      : searchParams.pwupdated
      ? { tone: "ok" as const, text: "Password updated." }
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Profile</h1>
        <p className="text-sm text-ink/50">Your instructor account.</p>
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

      {pwBanner ? (
        <div
          className={
            pwBanner.tone === "error"
              ? "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              : "rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep"
          }
        >
          {pwBanner.text}
        </div>
      ) : null}

      <div className="card p-6">
        <h2 className="mb-3 font-600">Account</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-ink/40">Name</dt><dd>{profile.name}</dd></div>
          <div><dt className="text-ink/40">Email</dt><dd>{profile.email}</dd></div>
        </dl>
      </div>

      <EditInstructorDetailsCard phone={profile.phone} dob={profile.dob} />

      {payMonths ? <InstructorPayHistory months={payMonths} now={now} /> : null}

      <ChangePasswordCard redirectTo="/instructor/profile" />
    </div>
  );
}
