import Link from "next/link";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, locationExpenses, locationRevenueHistory, locations, memberships } from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import { addLocationExpense, deleteLocationExpense } from "@/app/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";
import {
  formatDay,
  formatMoney,
  fromStudioTime,
  studioDateKey,
  parseMonthKey,
  shiftMonthKey,
  monthLabel,
  INSTRUCTOR_RATE_CENTS,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid: "Fill in a date, category, and an amount greater than $0.",
};

export default async function LocationFinancesPage({
  searchParams,
}: {
  searchParams: { month?: string; saved?: string; error?: string };
}) {
  await requireAdmin();

  const now = new Date();
  const todayKey = studioDateKey(now);
  const monthKey = parseMonthKey(searchParams.month, todayKey.slice(0, 7));
  const monthStart = fromStudioTime(`${monthKey}-01T00:00`);
  const monthEnd = fromStudioTime(`${shiftMonthKey(monthKey, 1)}-01T00:00`);
  const prevMonth = shiftMonthKey(monthKey, -1);
  const nextMonth = shiftMonthKey(monthKey, 1);
  const monthStartStr = `${monthKey}-01`;
  const monthEndStr = `${shiftMonthKey(monthKey, 1)}-01`;

  const [allLocations, sessions, expenses, revenueHistory, liveMemberships] = await Promise.all([
    db.select().from(locations),
    db.query.classSessions.findMany({
      where: and(gte(classSessions.startsAt, monthStart), lt(classSessions.startsAt, monthEnd)),
    }),
    db.query.locationExpenses.findMany({
      where: and(gte(locationExpenses.date, monthStartStr), lt(locationExpenses.date, monthEndStr)),
      orderBy: (e, { asc }) => [asc(e.date)],
    }),
    db.query.locationRevenueHistory.findMany({
      where: and(gte(locationRevenueHistory.date, monthStartStr), lt(locationRevenueHistory.date, monthEndStr)),
    }),
    db.query.memberships.findMany({
      where: and(
        gte(memberships.createdAt, monthStart),
        lt(memberships.createdAt, monthEnd),
        inArray(memberships.billingType, ["one_time", "recurring", "zelle"])
      ),
      with: { package: true, user: { columns: { locationId: true } } },
    }),
  ]);

  const banner =
    searchParams.error && errorMessages[searchParams.error]
      ? { tone: "error" as const, text: errorMessages[searchParams.error] }
      : searchParams.saved
      ? { tone: "ok" as const, text: "Saved." }
      : null;

  const rows = allLocations
    .map((location) => {
      const instructorClasses = sessions.filter(
        (s) => s.locationId === location.id && !s.canceled && s.startsAt < now
      ).length;
      const instructorCents = instructorClasses * INSTRUCTOR_RATE_CENTS;

      const locExpenses = expenses.filter((e) => e.locationId === location.id);
      const manualExpenseCents = locExpenses.reduce((sum, e) => sum + e.amountCents, 0);
      const totalExpenseCents = instructorCents + manualExpenseCents;

      const historicalRevenueCents = revenueHistory
        .filter((r) => r.locationId === location.id)
        .reduce((sum, r) => sum + r.amountCents, 0);
      const liveRevenueCents = liveMemberships
        .filter((m) => m.user.locationId === location.id)
        .reduce((sum, m) => sum + m.package.priceCents, 0);
      const totalRevenueCents = historicalRevenueCents + liveRevenueCents;

      const netCents = totalRevenueCents - totalExpenseCents;
      const hasActivity =
        instructorClasses > 0 || locExpenses.length > 0 || totalRevenueCents > 0;

      return {
        location,
        instructorClasses,
        instructorCents,
        locExpenses,
        totalExpenseCents,
        totalRevenueCents,
        netCents,
        hasActivity,
      };
    })
    .filter((r) => r.hasActivity);

  const grandRevenue = rows.reduce((sum, r) => sum + r.totalRevenueCents, 0);
  const grandExpense = rows.reduce((sum, r) => sum + r.totalExpenseCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-600">Revenue &amp; expenses</h1>
          <p className="text-sm text-ink/50">By studio, by month.</p>
        </div>
        <Link href="/admin/profile" className="text-sm text-magenta">← Profile</Link>
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

      <div className="flex items-center justify-between">
        <h2 className="font-600">{monthLabel(monthKey)}</h2>
        <div className="flex items-center gap-1.5">
          <Link href={`/admin/location-finances?month=${prevMonth}`} className="btn-ghost px-3 py-1.5 text-xs">
            ‹
          </Link>
          <Link href={`/admin/location-finances?month=${todayKey.slice(0, 7)}`} className="btn-ghost px-3 py-1.5 text-xs">
            This month
          </Link>
          <Link href={`/admin/location-finances?month=${nextMonth}`} className="btn-ghost px-3 py-1.5 text-xs">
            ›
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-ink/50">Revenue</p>
          <p className="mt-1 font-display text-3xl font-600 text-magenta">{formatMoney(grandRevenue)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink/50">Expenses</p>
          <p className="mt-1 font-display text-3xl font-600 text-magenta">{formatMoney(grandExpense)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink/50">Net</p>
          <p className={`mt-1 font-display text-3xl font-600 ${grandRevenue - grandExpense < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {formatMoney(grandRevenue - grandExpense)}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-ink/40">No activity this month.</div>
      ) : (
        rows.map(({ location, instructorClasses, instructorCents, locExpenses, totalExpenseCents, totalRevenueCents, netCents }) => (
          <div key={location.id} className="card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="font-600">{location.name}</p>
              <div className="flex gap-4 text-sm">
                <span className="text-ink/50">Revenue <span className="font-600 text-ink/80">{formatMoney(totalRevenueCents)}</span></span>
                <span className="text-ink/50">Expenses <span className="font-600 text-ink/80">{formatMoney(totalExpenseCents)}</span></span>
                <span className={netCents < 0 ? "text-red-600" : "text-emerald-600"}>
                  Net <span className="font-600">{formatMoney(netCents)}</span>
                </span>
              </div>
            </div>

            <ul className="divide-y divide-ink/5 text-sm">
              <li className="flex items-center justify-between py-2">
                <span>
                  Instructor pay · {instructorClasses} class{instructorClasses === 1 ? "" : "es"}
                </span>
                <span className="text-ink/50">{formatMoney(instructorCents)}</span>
              </li>
              {locExpenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <span>
                    {e.category}
                    {e.comment ? <span className="text-ink/40"> · {e.comment}</span> : null} ·{" "}
                    {formatDay(fromStudioTime(`${e.date}T12:00`))}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-ink/50">{formatMoney(e.amountCents)}</span>
                    <ConfirmDeleteButton
                      id={e.id}
                      action={deleteLocationExpense}
                      confirmText={`Delete this ${e.category} expense (${formatMoney(e.amountCents)})?`}
                      className="text-xs text-red-600 hover:underline"
                      extraFields={{ month: monthKey }}
                    />
                  </span>
                </li>
              ))}
            </ul>

            <form action={addLocationExpense} className="mt-4 flex flex-wrap items-end gap-2 border-t border-ink/5 pt-4">
              <input type="hidden" name="locationId" value={location.id} />
              <input type="hidden" name="month" value={monthKey} />
              <div>
                <label className="label">Date</label>
                <input type="date" name="date" required className="input py-1.5 text-sm" />
              </div>
              <div>
                <label className="label">Category</label>
                <input name="category" placeholder="Studio, Advertising…" required className="input py-1.5 text-sm" />
              </div>
              <div className="w-28">
                <label className="label">Amount</label>
                <input type="number" name="amount" step="0.01" min="0.01" required className="input py-1.5 text-sm" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="label">Note</label>
                <input name="comment" className="input py-1.5 text-sm" />
              </div>
              <button type="submit" className="btn-primary px-4 py-1.5 text-sm">
                Add expense
              </button>
            </form>
          </div>
        ))
      )}
    </div>
  );
}
