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

type LedgerRow = {
  date: Date;
  type: "Revenue" | "Expense";
  description: string;
  amountCents: number; // signed: positive for revenue, negative for expense
  expenseId?: number; // present only for deletable manual expense rows
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
      with: { package: true, user: { columns: { name: true, locationId: true } } },
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

      const ledger: LedgerRow[] = [];

      for (const r of revenueHistory.filter((r) => r.locationId === location.id)) {
        ledger.push({
          date: fromStudioTime(`${r.date}T12:00`),
          type: "Revenue",
          description: r.customerName ? r.customerName + (r.comment ? ` (${r.comment})` : "") : r.comment || "Registration",
          amountCents: r.amountCents,
        });
      }
      for (const m of liveMemberships.filter((m) => m.user.locationId === location.id)) {
        ledger.push({
          date: m.createdAt,
          type: "Revenue",
          description: `${m.user.name} — ${m.package.name}`,
          amountCents: m.package.priceCents,
        });
      }
      for (const e of expenses.filter((e) => e.locationId === location.id)) {
        ledger.push({
          date: fromStudioTime(`${e.date}T12:00`),
          type: "Expense",
          description: e.category + (e.comment ? ` — ${e.comment}` : ""),
          amountCents: -e.amountCents,
          expenseId: e.id,
        });
      }
      if (instructorClasses > 0) {
        ledger.push({
          date: monthStart,
          type: "Expense",
          description: `Instructor pay (${instructorClasses} class${instructorClasses === 1 ? "" : "es"})`,
          amountCents: -instructorCents,
        });
      }
      ledger.sort((a, b) => a.date.getTime() - b.date.getTime());

      const totalRevenueCents = ledger.filter((r) => r.type === "Revenue").reduce((sum, r) => sum + r.amountCents, 0);
      const totalExpenseCents = -ledger.filter((r) => r.type === "Expense").reduce((sum, r) => sum + r.amountCents, 0);
      const netCents = totalRevenueCents - totalExpenseCents;

      return { location, ledger, totalRevenueCents, totalExpenseCents, netCents };
    })
    .filter((r) => r.ledger.length > 0);

  const grandRevenue = rows.reduce((sum, r) => sum + r.totalRevenueCents, 0);
  const grandExpense = rows.reduce((sum, r) => sum + r.totalExpenseCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-600">Revenue &amp; expenses</h1>
          <p className="text-sm text-ink/50">By studio, by month.</p>
        </div>
        <Link href="/admin" className="text-sm text-magenta">← Dashboard</Link>
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
        rows.map(({ location, ledger, netCents }) => (
          <div key={location.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/5 p-5">
              <p className="font-600">{location.name}</p>
              <span className={netCents < 0 ? "text-red-600" : "text-emerald-600"}>
                Net <span className="font-600">{formatMoney(netCents)}</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-blush/50 text-left text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Date</th>
                    <th className="px-5 py-2.5 font-semibold">Type</th>
                    <th className="px-5 py-2.5 font-semibold">Description</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
                    <th className="px-5 py-2.5 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {ledger.map((row, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-5 py-2 text-ink/60">{formatDay(row.date)}</td>
                      <td className="px-5 py-2">
                        <span
                          className={`badge ${
                            row.type === "Revenue" ? "bg-emerald-100 text-emerald-700" : "bg-blush text-magenta-deep"
                          }`}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-ink/70">{row.description}</td>
                      <td
                        className={`whitespace-nowrap px-5 py-2 text-right font-medium ${
                          row.amountCents < 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {row.amountCents < 0 ? "-" : ""}
                        {formatMoney(Math.abs(row.amountCents))}
                      </td>
                      <td className="px-5 py-2 text-right">
                        {row.expenseId ? (
                          <ConfirmDeleteButton
                            id={row.expenseId}
                            action={deleteLocationExpense}
                            confirmText={`Delete this expense (${formatMoney(-row.amountCents)})?`}
                            className="text-xs text-red-600 hover:underline"
                            extraFields={{ month: monthKey }}
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-ink/10 bg-blush/20 font-600">
                    <td className="px-5 py-2.5" colSpan={3}>
                      Total
                    </td>
                    <td className={`whitespace-nowrap px-5 py-2.5 text-right ${netCents < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {netCents < 0 ? "-" : ""}
                      {formatMoney(Math.abs(netCents))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <form action={addLocationExpense} className="flex flex-wrap items-end gap-2 border-t border-ink/5 p-5">
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
