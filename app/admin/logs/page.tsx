import { desc, ilike, or, and, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, errorLogs } from "@/db/schema";
import { formatDay, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parseDetails(raw: string | null): string {
  if (!raw) return "—";
  try {
    const obj = JSON.parse(raw);
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
  } catch {
    return raw;
  }
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: { q?: string; tab?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const tab = searchParams.tab === "errors" ? "errors" : "audit";

  const auditWhere: SQL | undefined = q
    ? or(ilike(auditLogs.actorName, `%${q}%`), ilike(auditLogs.action, `%${q}%`), ilike(auditLogs.targetType, `%${q}%`))
    : undefined;
  const errorWhere: SQL | undefined = q
    ? or(ilike(errorLogs.source, `%${q}%`), ilike(errorLogs.message, `%${q}%`))
    : undefined;

  const [audit, errors] = await Promise.all([
    db.query.auditLogs.findMany({
      where: auditWhere,
      orderBy: [desc(auditLogs.createdAt)],
      limit: 200,
    }),
    db.query.errorLogs.findMany({
      where: errorWhere,
      orderBy: [desc(errorLogs.createdAt)],
      limit: 200,
    }),
  ]);

  const tabQuery = (t: string) => `/admin/logs?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Logs</h1>
        <p className="text-sm text-ink/50">
          Admin action history and caught failures. Kept for 3 months, then rotated out automatically.
        </p>
      </div>

      <form className="flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={q}
          placeholder={tab === "audit" ? "Search by actor, action, or target…" : "Search by source or message…"}
          className="input flex-1"
        />
        <button className="btn-subtle">Search</button>
      </form>

      <div className="flex gap-1.5">
        <a
          href={tabQuery("audit")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "audit" ? "bg-magenta text-white" : "bg-blush/40 text-ink/60 hover:bg-blush"
          }`}
        >
          Audit log {audit.length > 0 ? `(${audit.length})` : ""}
        </a>
        <a
          href={tabQuery("errors")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "errors" ? "bg-magenta text-white" : "bg-blush/40 text-ink/60 hover:bg-blush"
          }`}
        >
          Errors {errors.length > 0 ? `(${errors.length})` : ""}
        </a>
      </div>

      {tab === "audit" ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blush/50 text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">When</th>
                <th className="px-5 py-3 font-semibold">Actor</th>
                <th className="px-5 py-3 font-semibold">Action</th>
                <th className="px-5 py-3 font-semibold">Target</th>
                <th className="px-5 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {audit.map((row) => (
                <tr key={row.id} className="hover:bg-blush/20">
                  <td className="whitespace-nowrap px-5 py-3 text-ink/60">
                    {formatDay(row.createdAt)} {formatTime(row.createdAt)}
                  </td>
                  <td className="px-5 py-3 font-medium">{row.actorName}</td>
                  <td className="px-5 py-3">
                    <span className="badge bg-magenta/10 text-magenta-deep">{row.action}</span>
                  </td>
                  <td className="px-5 py-3 text-ink/60">
                    {row.targetType ? `${row.targetType}${row.targetId ? ` #${row.targetId}` : ""}` : "—"}
                  </td>
                  <td className="max-w-md truncate px-5 py-3 text-xs text-ink/50" title={parseDetails(row.details)}>
                    {parseDetails(row.details)}
                  </td>
                </tr>
              ))}
              {audit.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-ink/40">
                    No audit entries{q ? " match this search" : " yet"}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blush/50 text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">When</th>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 font-semibold">Message</th>
                <th className="px-5 py-3 font-semibold">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {errors.map((row) => (
                <tr key={row.id} className="hover:bg-blush/20">
                  <td className="whitespace-nowrap px-5 py-3 text-ink/60">
                    {formatDay(row.createdAt)} {formatTime(row.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    <span className="badge bg-red-50 text-red-700">{row.source}</span>
                  </td>
                  <td className="max-w-md px-5 py-3 text-ink/70">{row.message}</td>
                  <td className="max-w-xs truncate px-5 py-3 text-xs text-ink/50" title={parseDetails(row.context)}>
                    {parseDetails(row.context)}
                  </td>
                </tr>
              ))}
              {errors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-ink/40">
                    No errors logged{q ? " match this search" : " — nothing caught yet"}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
