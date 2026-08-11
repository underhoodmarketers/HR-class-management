import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instructorLocations, users } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { sendInstructorCustomerEmail } from "@/app/actions/instructor";
import EmailCustomerButton from "@/components/EmailCustomerButton";
import CustomersFilterBar from "@/components/CustomersFilterBar";
import { formatDay, formatBirthday } from "@/lib/utils";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  email_invalid: "Fill in a subject and a message.",
};

type SortField = "name" | "contact" | "membership" | "expires";
const SORT_LABELS: Record<SortField, string> = {
  name: "Name",
  contact: "Contact",
  membership: "Membership",
  expires: "Expires",
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
  const params = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]);
  params.set("sort", field);
  params.set("dir", nextDir);

  return (
    <Link href={`/instructor/customers?${params.toString()}`} className="flex items-center gap-1 hover:text-magenta-deep">
      {SORT_LABELS[field]}
      {isActive ? <span className="text-magenta">{activeDir === "asc" ? "↑" : "↓"}</span> : null}
    </Link>
  );
}

export default async function InstructorCustomersPage({
  searchParams,
}: {
  searchParams: {
    email_sent?: string;
    error?: string;
    q?: string;
    membership?: string;
    sort?: string;
    dir?: string;
  };
}) {
  const session = await requireInstructor();
  const now = new Date();

  const myLocations = await db.query.instructorLocations.findMany({
    where: eq(instructorLocations.userId, session.userId),
    with: { location: true },
  });
  const myLocationIds = new Set(myLocations.map((l) => l.locationId));
  const myLocationNames = myLocations.map((l) => l.location.name).join(", ");

  const customers = await db.query.users.findMany({
    where: eq(users.role, "customer"),
    with: {
      memberships: { with: { package: true } },
      locations: true,
    },
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  // A customer is "yours" if any of their preferred studios is one you're assigned to.
  const scoped = customers
    .filter((c) => c.locations.some((l) => myLocationIds.has(l.locationId)))
    .map((c) => {
      const activeMemberships = c.memberships.filter((m) => m.status === "active" && m.endsAt > now);
      const soonestExpiring =
        activeMemberships.length > 0
          ? activeMemberships.reduce((a, b) => (a.endsAt < b.endsAt ? a : b))
          : null;
      return { ...c, activeMemberships, soonestExpiring };
    });

  const q = (searchParams.q ?? "").trim().toLowerCase();
  const membershipFilter = searchParams.membership ?? "";

  let filtered = scoped.filter((c) => {
    if (q) {
      const haystack = `${c.name} ${c.email} ${c.phone ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (membershipFilter === "active" && c.activeMemberships.length === 0) return false;
    if (membershipFilter === "none" && c.activeMemberships.length > 0) return false;
    return true;
  });

  const sort: SortField = (
    ["name", "contact", "membership", "expires"].includes(searchParams.sort ?? "") ? searchParams.sort : "name"
  ) as SortField;
  const dir: "asc" | "desc" = searchParams.dir === "desc" ? "desc" : "asc";

  const cmp: Record<SortField, (a: (typeof filtered)[number], b: (typeof filtered)[number]) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    contact: (a, b) => a.email.localeCompare(b.email),
    membership: (a, b) =>
      (a.activeMemberships[0]?.package.name ?? "").localeCompare(b.activeMemberships[0]?.package.name ?? ""),
    expires: (a, b) => (a.soonestExpiring?.endsAt.getTime() ?? 0) - (b.soonestExpiring?.endsAt.getTime() ?? 0),
  };
  filtered = [...filtered].sort((a, b) => (dir === "asc" ? cmp[sort](a, b) : -cmp[sort](a, b)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Customers</h1>
        <p className="text-sm text-ink/50">
          {myLocationNames ? `${myLocationNames} · ` : ""}
          {filtered.length === scoped.length
            ? `${scoped.length} customer${scoped.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${scoped.length} customers`}
        </p>
      </div>

      {searchParams.email_sent ? (
        <div className="rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep">
          Email sent.
        </div>
      ) : searchParams.error && errorMessages[searchParams.error] ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessages[searchParams.error]}
        </div>
      ) : null}

      {myLocations.length === 0 ? (
        <div className="card p-6 text-sm text-ink/50">
          You&apos;re not assigned to a studio yet. Ask an admin to assign one.
        </div>
      ) : (
        <>
          <CustomersFilterBar showWaiver={false} />

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
                    <SortHeader field="membership" activeSort={sort} activeDir={dir} searchParams={searchParams} />
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    <SortHeader field="expires" activeSort={sort} activeDir={dir} searchParams={searchParams} />
                  </th>
                  <th className="px-5 py-3 font-semibold">Birthday</th>
                  <th className="px-5 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-ink/60">
                      <div>{c.email}</div>
                      <div className="text-xs text-ink/40">{c.phone || "—"}</div>
                    </td>
                    <td className="px-5 py-3 text-ink/60">
                      {c.activeMemberships.length > 0 ? (
                        c.activeMemberships.map((m) => <div key={m.id}>{m.package.name}</div>)
                      ) : (
                        <span className="text-ink/40">None</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink/60">
                      {c.activeMemberships.length > 0 ? (
                        c.activeMemberships.map((m) => <div key={m.id}>{formatDay(m.endsAt)}</div>)
                      ) : (
                        <span className="text-ink/40">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink/60">{formatBirthday(c.dob)}</td>
                    <td className="px-5 py-3 text-right">
                      <EmailCustomerButton
                        customerId={c.id}
                        customerName={c.name}
                        action={sendInstructorCustomerEmail}
                      />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-ink/40">
                      {scoped.length === 0 ? "No customers at your studio yet." : "No customers match these filters."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
