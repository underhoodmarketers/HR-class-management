import Link from "next/link";
import { requireAdmin } from "@/lib/guards";
import { addLocationExpense, deleteLocationExpense, addLocationRevenue, deleteLocationRevenue } from "@/app/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";
import { formatDay, formatMoney } from "@/lib/utils";
import { getLocationLedgers } from "@/lib/financeLedger";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid: "Fill in a date, description, and an amount greater than $0.",
};

type SortField = "date" | "type" | "description" | "amount";
const SORT_LABELS: Record<SortField, string> = {
  date: "Date",
  type: "Type",
  description: "Description",
  amount: "Amount",
};

function buildUrl(base: Record<string, string | undefined>, overrides: Record<string, string>) {
  const params = new URLSearchParams(
    Object.entries({ ...base, ...overrides }).filter(([, v]) => v) as [string, string][]
  );
  return `/admin/location-finances?${params.toString()}`;
}

export default async function LocationFinancesPage({
  searchParams,
}: {
  searchParams: {
    loc?: string;
    sort?: string;
    dir?: string;
    type?: string;
    q?: string;
    saved?: string;
    error?: string;
  };
}) {
  await requireAdmin();

  const banner =
    searchParams.error && errorMessages[searchParams.error]
      ? { tone: "error" as const, text: errorMessages[searchParams.error] }
      : searchParams.saved
      ? { tone: "ok" as const, text: "Saved." }
      : null;

  const rows = await getLocationLedgers();

  const grandRevenue = rows.reduce((sum, r) => sum + r.totalRevenueCents, 0);
  const grandExpense = rows.reduce((sum, r) => sum + r.totalExpenseCents, 0);

  const activeLocationId = searchParams.loc ? Number(searchParams.loc) : rows[0]?.location.id;
  const active = rows.find((r) => r.location.id === activeLocationId) ?? rows[0];

  // "all" | "revenue" | "expense" (any category) | "expense:<Category>" (one
  // specific category, e.g. "expense:Studio" or "expense:Instructor").
  const typeFilter = searchParams.type ?? "all";
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const sortField: SortField = (["date", "type", "description", "amount"].includes(searchParams.sort ?? "")
    ? searchParams.sort
    : "date") as SortField;
  const sortDir: "asc" | "desc" = searchParams.dir === "desc" ? "desc" : "asc";

  // Only the categories actually present for this studio, so the buttons
  // never offer a filter that would just show "nothing matches."
  const expenseCategories = active
    ? [...new Set(active.ledger.filter((r) => r.type === "Expense" && r.category).map((r) => r.category as string))].sort(
        (a, b) => {
          const priority = (c: string) => (c === "Studio" ? 0 : c === "Instructor" ? 1 : 2);
          const diff = priority(a) - priority(b);
          return diff !== 0 ? diff : a.localeCompare(b);
        }
      )
    : [];

  const filteredLedger = active
    ? active.ledger
        .filter((row) => {
          if (typeFilter === "all") return true;
          if (typeFilter === "revenue") return row.type === "Revenue";
          if (typeFilter === "expense") return row.type === "Expense";
          if (typeFilter.startsWith("expense:")) {
            return row.type === "Expense" && row.category === typeFilter.slice("expense:".length);
          }
          return true;
        })
        .filter((row) => !q || row.description.toLowerCase().includes(q))
        .sort((a, b) => {
          let cmp = 0;
          if (sortField === "date") cmp = a.date.getTime() - b.date.getTime();
          else if (sortField === "type") cmp = a.type.localeCompare(b.type);
          else if (sortField === "description") cmp = a.description.localeCompare(b.description);
          else cmp = a.amountCents - b.amountCents;
          return sortDir === "asc" ? cmp : -cmp;
        })
    : [];

  const filteredTotalCents = filteredLedger.reduce((sum, r) => sum + r.amountCents, 0);
  const filtersActive = typeFilter !== "all" || q.length > 0;

  const baseParams = { loc: String(activeLocationId ?? ""), sort: sortField, dir: sortDir, type: typeFilter, q: searchParams.q };

  function SortHeader({ field, label, className }: { field: SortField; label: string; className?: string }) {
    const isActive = sortField === field;
    const nextDir = isActive && sortDir === "asc" ? "desc" : "asc";
    return (
      <Link
        href={buildUrl(baseParams, { sort: field, dir: nextDir })}
        className={`flex items-center gap-1 hover:text-magenta-deep ${className ?? ""}`}
      >
        {label}
        {isActive ? <span className="text-magenta">{sortDir === "asc" ? "↑" : "↓"}</span> : null}
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-600">Revenue &amp; expenses</h1>
          <p className="text-sm text-ink/50">By studio, all-time through today. Updates as customers sign up.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin/location-finances/export" className="btn-subtle">
            Export CSV
          </a>
          <Link href="/admin" className="text-sm text-magenta">← Dashboard</Link>
        </div>
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
        <div className="card p-8 text-center text-ink/40">No activity yet.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-ink/5 pb-3">
            {rows.map((r) => (
              <Link
                key={r.location.id}
                href={buildUrl(baseParams, { loc: String(r.location.id), sort: "date", dir: "asc", type: "all", q: "" })}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  r.location.id === active?.location.id
                    ? "bg-magenta text-white"
                    : "bg-blush/40 text-ink/60 hover:bg-blush"
                }`}
              >
                {r.location.name}{" "}
                <span className={r.location.id === active?.location.id ? "text-white/80" : "text-ink/40"}>
                  ({formatMoney(r.netCents)})
                </span>
              </Link>
            ))}
          </div>

          {active ? (
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/5 p-5">
                <p className="font-600">{active.location.name}</p>
                <span className={active.netCents < 0 ? "text-red-600" : "text-emerald-600"}>
                  Net <span className="font-600">{formatMoney(active.netCents)}</span>
                </span>
              </div>

              <form
                method="GET"
                className="flex flex-wrap items-center gap-3 border-b border-ink/5 p-5"
              >
                <input type="hidden" name="loc" value={activeLocationId} />
                <input type="hidden" name="sort" value={sortField} />
                <input type="hidden" name="dir" value={sortDir} />
                <input
                  name="q"
                  defaultValue={searchParams.q ?? ""}
                  placeholder="Search description…"
                  className="input min-w-[200px] flex-1 py-1.5 text-sm"
                />
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "revenue", "expense"] as const).map((t) => (
                    <Link
                      key={t}
                      href={buildUrl(baseParams, { type: t })}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        typeFilter === t ? "bg-magenta text-white" : "bg-blush/40 text-ink/60 hover:bg-blush"
                      }`}
                    >
                      {t === "all" ? "All" : t === "revenue" ? "Revenue" : "All expense"}
                    </Link>
                  ))}
                  {expenseCategories.map((cat) => {
                    const value = `expense:${cat}`;
                    return (
                      <Link
                        key={cat}
                        href={buildUrl(baseParams, { type: value })}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          typeFilter === value ? "bg-magenta text-white" : "bg-blush/40 text-ink/60 hover:bg-blush"
                        }`}
                      >
                        {cat} expense
                      </Link>
                    );
                  })}
                </div>
                <button type="submit" className="btn-subtle px-4 py-1.5 text-sm">
                  Filter
                </button>
                {filtersActive ? (
                  <Link href={buildUrl(baseParams, { type: "all", q: "" })} className="text-xs font-semibold text-magenta hover:underline">
                    Clear
                  </Link>
                ) : null}
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-blush/50 text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold"><SortHeader field="date" label="Date" /></th>
                      <th className="px-5 py-2.5 font-semibold"><SortHeader field="type" label="Type" /></th>
                      <th className="px-5 py-2.5 font-semibold"><SortHeader field="description" label="Description" /></th>
                      <th className="px-5 py-2.5 text-right font-semibold"><SortHeader field="amount" label="Amount" className="justify-end" /></th>
                      <th className="px-5 py-2.5 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {filteredLedger.map((row, i) => (
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
                          {row.category ? <span className="ml-1.5 text-xs text-ink/40">{row.category}</span> : null}
                        </td>
                        <td className="px-5 py-2 text-ink/70">
                          {row.customerId ? (
                            <Link
                              href={`/admin/customers/${row.customerId}`}
                              className="hover:text-magenta-deep hover:underline"
                            >
                              {row.description}
                            </Link>
                          ) : (
                            row.description
                          )}
                        </td>
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
                            />
                          ) : row.revenueId ? (
                            <ConfirmDeleteButton
                              id={row.revenueId}
                              action={deleteLocationRevenue}
                              confirmText={`Delete this revenue entry (${formatMoney(row.amountCents)})?`}
                              className="text-xs text-red-600 hover:underline"
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {filteredLedger.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-ink/40">
                          Nothing matches these filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-ink/10 bg-blush/20 font-600">
                      <td className="px-5 py-2.5" colSpan={3}>
                        {filtersActive ? "Total (filtered)" : "Total"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-5 py-2.5 text-right ${
                          filteredTotalCents < 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {filteredTotalCents < 0 ? "-" : ""}
                        {formatMoney(Math.abs(filteredTotalCents))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <form action={addLocationRevenue} className="flex flex-wrap items-end gap-2 border-t border-ink/5 p-5">
                <input type="hidden" name="locationId" value={active.location.id} />
                <div>
                  <label className="label">Date</label>
                  <input type="date" name="date" required className="input py-1.5 text-sm" />
                </div>
                <div>
                  <label className="label">Description</label>
                  <input
                    name="customerName"
                    placeholder="Cash payment, ClassPass…"
                    required
                    className="input py-1.5 text-sm"
                  />
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
                  Add revenue
                </button>
              </form>

              <form action={addLocationExpense} className="flex flex-wrap items-end gap-2 border-t border-ink/5 p-5">
                <input type="hidden" name="locationId" value={active.location.id} />
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
                <button type="submit" className="btn-subtle px-4 py-1.5 text-sm">
                  Add expense
                </button>
              </form>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
