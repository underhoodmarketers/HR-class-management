import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations, users } from "@/db/schema";
import { deleteCustomer } from "@/app/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";
import CustomersFilterBar from "@/components/CustomersFilterBar";
import { formatDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SortField = "name" | "contact" | "studio" | "membership" | "joined";

const SORT_LABELS: Record<SortField, string> = {
  name: "Name",
  contact: "Contact",
  studio: "Studio",
  membership: "Membership",
  joined: "Joined",
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
        memberships: { with: { package: true } },
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
    ["name", "contact", "studio", "membership", "joined"].includes(searchParams.sort ?? "")
      ? searchParams.sort
      : "joined"
  ) as SortField;
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";

  const withActive = customers.map((c) => ({
    ...c,
    active: c.memberships.find((m) => m.status === "active" && m.endsAt > now) ?? null,
  }));

  let filtered = withActive.filter((c) => {
    if (q) {
      const haystack = `${c.name} ${c.email} ${c.phone ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (studioFilter === "none" && c.locationId) return false;
    if (studioFilter && studioFilter !== "none" && c.locationId !== Number(studioFilter)) {
      return false;
    }
    if (membershipFilter === "active" && !c.active) return false;
    if (membershipFilter === "none" && c.active) return false;
    if (waiverFilter === "signed" && c.signatures.length === 0) return false;
    if (waiverFilter === "missing" && c.signatures.length > 0) return false;
    return true;
  });

  const cmp: Record<SortField, (a: (typeof withActive)[number], b: (typeof withActive)[number]) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    contact: (a, b) => a.email.localeCompare(b.email),
    studio: (a, b) => (a.location?.name ?? "").localeCompare(b.location?.name ?? ""),
    membership: (a, b) => (a.active?.package.name ?? "").localeCompare(b.active?.package.name ?? ""),
    joined: (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
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

      <div className="card overflow-hidden">
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
              <th className="px-5 py-3 font-semibold">Waiver</th>
              <th className="px-5 py-3 font-semibold">
                <SortHeader field="joined" activeSort={sort} activeDir={dir} searchParams={searchParams} />
              </th>
              <th className="px-5 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-blush/20">
                <td className="px-5 py-3">
                  <Link href={`/admin/customers/${c.id}`} className="font-medium text-magenta-deep hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-ink/60">
                  <div>{c.email}</div>
                  <div className="text-xs text-ink/40">{c.phone || "—"}</div>
                </td>
                <td className="px-5 py-3 text-ink/60">{c.location?.name || "—"}</td>
                <td className="px-5 py-3">
                  {c.active ? (
                    <span className="badge bg-magenta/10 text-magenta-deep">{c.active.package.name}</span>
                  ) : (
                    <span className="text-ink/40">None</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {c.signatures.length ? (
                    <span className="badge bg-emerald-100 text-emerald-700">Signed</span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-700">Missing</span>
                  )}
                </td>
                <td className="px-5 py-3 text-ink/50">{formatDay(c.createdAt)}</td>
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
                <td colSpan={7} className="px-5 py-8 text-center text-ink/40">
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
