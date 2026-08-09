import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations, users } from "@/db/schema";
import { deleteCustomer } from "@/app/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";
import CustomersFilterBar from "@/components/CustomersFilterBar";
import { formatDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SortField = "name" | "contact" | "studio" | "membership" | "start" | "end";

const SORT_LABELS: Record<SortField, string> = {
  name: "Name",
  contact: "Contact",
  studio: "Studio",
  membership: "Membership",
  start: "Start date",
  end: "End date",
};

function SortHeader({
  field,
  activeSort,
  activeDir,
  searchParams,
}: {
  field: SortField;
  activeSort: SortField;
  activeDir: "asc" | "desc";
  searchParams: Record<string, string | undefined>;
}) {
  const isActive = activeSort === field;
  const nextDir = isActive && activeDir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams(
    Object.entries(searchParams).filter(([k, v]) => v && k !== "deleted") as [string, string][]
  );
  params.set("sort", field);
  params.set("dir", nextDir);

  return (
    <Link
      href={`/admin/customers?${params.toString()}`}
      className="flex items-center gap-1 hover:text-magenta-deep"
    >
      {SORT_LABELS[field]}
      {isActive ? <span className="text-magenta">{activeDir === "asc" ? "↑" : "↓"}</span> : null}
    </Link>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: {
    deleted?: string;
    q?: string;
    studio?: string;
    membership?: string;
    waiver?: string;
    sort?: string;
    dir?: string;
  };
}) {
  const now = new Date();

  const [customers, studios] = await Promise.all([
    db.query.users.findMany({
      where: eq(users.role, "customer"),
      with: {
        memberships: {
          with: { package: true },
          orderBy: (m, { desc }) => [desc(m.createdAt)],
        },
        signatures: true,
        location: true,
      },
    }),
    db
      .select()
      .from(locations)
      .where(and(eq(locations.active, true), isNull(locations.archivedAt))),
  ]);

  const q = (searchParams.q ?? "").trim().toLowerCase();
  const studioFilter = searchParams.studio ?? "";
  const membershipFilter = searchParams.membership ?? "";
  const waiverFilter = searchParams.waiver ?? "";
  const sort: SortField = (
    ["name", "contact", "studio", "membership", "start", "end"].includes(searchParams.sort ?? "")
      ? searchParams.sort
      : "name"
  ) as SortField;
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";

  // The most recent membership regardless of status, so a pending or
  // expired one still shows its dates — "active" tracks whether it's
  // actually in effect right now, for the badge and the filter.
  const withCurrent = customers.map((c) => {
    const current = c.memberships[0] ?? null;
    const isActive = current?.status === "active" && current.endsAt > now;
    return { ...c, current, isActive };
  });

  let filtered = withCurrent.filter((c) => {
    if (q) {
      const haystack = `${c.name} ${c.email} ${c.phone ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (studioFilter === "none" && c.locationId) return false;
    if (studioFilter && studioFilter !== "none" && c.locationId !== Number(studioFilter)) {
      return false;
    }
    if (membershipFilter === "active" && !c.isActive) return false;
    if (membershipFilter === "none" && c.isActive) return false;
    if (waiverFilter === "signed" && c.signatures.length === 0) return false;
    if (waiverFilter === "missing" && c.signatures.length > 0) return false;
    return true;
  });

  const backQuery = new URLSearchParams(
    Object.entries(searchParams).filter(([k, v]) => v && k !== "deleted") as [string, string][]
  ).toString();

  const cmp: Record<SortField, (a: (typeof withCurrent)[number], b: (typeof withCurrent)[number]) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    contact: (a, b) => a.email.localeCompare(b.email),
    studio: (a, b) => (a.location?.name ?? "").localeCompare(b.location?.name ?? ""),
    membership: (a, b) => (a.current?.package.name ?? "").localeCompare(b.current?.package.name ?? ""),
    start: (a, b) => (a.current?.startsAt.getTime() ?? 0) - (b.current?.startsAt.getTime() ?? 0),
    end: (a, b) => (a.current?.endsAt.getTime() ?? 0) - (b.current?.endsAt.getTime() ?? 0),
  };
  filtered = [...filtered].sort((a, b) => (dir === "asc" ? cmp[sort](a, b) : -cmp[sort](a, b)));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-600">Customers</h1>
          <p className="text-sm text-ink/50">
            {filtered.length === customers.length
              ? `${customers.length} members`
              : `${filtered.length} of ${customers.length} members`}
          </p>
        </div>
        <Link href="/admin/customers/new" className="btn-primary">
          New customer
        </Link>
      </div>

      {searchParams.deleted ? (
        <div className="rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep">
          Customer deleted.
        </div>
      ) : null}

      <CustomersFilterBar studios={studios.map((s) => ({ id: s.id, name: s.name }))} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-blush/50 text-left text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-semibold">
                <SortHeader field="name" activeSort={sort} activeDir={dir} searchParams={searchParams} />
              </th>
              <th className="px-5 py-3 font-semibold">
                <SortHeader field="contact" activeSort={sort} activeDir={dir} searchParams={searchParams} />
              </th>
              <th className="px-5 py-3 font-semibold">
                <SortHeader field="studio" activeSort={sort} activeDir={dir} searchParams={searchParams} />
              </th>
              <th className="px-5 py-3 font-semibold">
                <SortHeader field="membership" activeSort={sort} activeDir={dir} searchParams={searchParams} />
              </th>
              <th className="px-5 py-3 font-semibold">
                <SortHeader field="start" activeSort={sort} activeDir={dir} searchParams={searchParams} />
              </th>
              <th className="px-5 py-3 font-semibold">
                <SortHeader field="end" activeSort={sort} activeDir={dir} searchParams={searchParams} />
              </th>
              <th className="px-5 py-3 font-semibold">Waiver</th>
              <th className="px-5 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-blush/20">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/customers/${c.id}${backQuery ? `?from=${encodeURIComponent(backQuery)}` : ""}`}
                    className="font-medium text-magenta-deep hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-ink/60">
                  <div>{c.email}</div>
                  <div className="text-xs text-ink/40">{c.phone || "—"}</div>
                </td>
                <td className="px-5 py-3 text-ink/60">{c.location?.name || "—"}</td>
                <td className="px-5 py-3">
                  {c.current ? (
                    <>
                      <span className="badge bg-magenta/10 text-magenta-deep">{c.current.package.name}</span>
                      {!c.isActive ? (
                        <span className="ml-1.5 text-xs text-ink/40">({c.current.status})</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-ink/40">None</span>
                  )}
                </td>
                <td className="px-5 py-3 text-ink/60">
                  {c.current ? formatDay(c.current.startsAt) : "—"}
                </td>
                <td className="px-5 py-3 text-ink/60">
                  {c.current ? formatDay(c.current.endsAt) : "—"}
                </td>
                <td className="px-5 py-3">
                  {c.signatures.length ? (
                    <span className="badge bg-emerald-100 text-emerald-700">Signed</span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-700">Missing</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <ConfirmDeleteButton
                    id={c.id}
                    action={deleteCustomer}
                    confirmText={`Delete ${c.name}?\n\nThis removes their account, memberships, bookings, and waiver record. This can't be undone.`}
                    className="rounded-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-ink/40">
                  {customers.length === 0 ? "No customers yet." : "No customers match these filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
