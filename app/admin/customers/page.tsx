import Link from "next/link";
import { deleteCustomer, sendAdminCustomerEmail } from "@/app/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";
import CustomersFilterBar from "@/components/CustomersFilterBar";
import EmailCustomerButton from "@/components/EmailCustomerButton";
import { formatDay } from "@/lib/utils";
import { getFilteredCustomers, type SortField } from "@/lib/customerDirectory";

const errorMessages: Record<string, string> = {
  email_invalid: "Fill in a subject and a message.",
};

export const dynamic = "force-dynamic";

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
    email_sent?: string;
    error?: string;
  };
}) {
  const { customers, studios, filtered, sort, dir } = await getFilteredCustomers(searchParams);

  const backQuery = new URLSearchParams(
    Object.entries(searchParams).filter(
      ([k, v]) => v && !["deleted", "email_sent", "error"].includes(k)
    ) as [string, string][]
  ).toString();

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
        <div className="flex items-center gap-2">
          <a
            href={`/admin/customers/export${backQuery ? `?${backQuery}` : ""}`}
            className="btn-subtle"
          >
            Export CSV
          </a>
          <Link href="/admin/customers/new" className="btn-primary">
            New customer
          </Link>
        </div>
      </div>

      {searchParams.deleted ? (
        <div className="rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep">
          Customer deleted.
        </div>
      ) : searchParams.email_sent ? (
        <div className="rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep">
          Email sent.
        </div>
      ) : searchParams.error && errorMessages[searchParams.error] ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessages[searchParams.error]}
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
                <td className="px-5 py-3 text-ink/60">{c.studioNames || "—"}</td>
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
                  <div className="flex items-center justify-end gap-1">
                    <EmailCustomerButton
                      customerId={c.id}
                      customerName={c.name}
                      action={sendAdminCustomerEmail}
                      redirectQuery={backQuery}
                    />
                    <ConfirmDeleteButton
                      id={c.id}
                      action={deleteCustomer}
                      confirmText={`Delete ${c.name}?\n\nThis removes their account, memberships, bookings, and waiver record. This can't be undone.`}
                      className="rounded-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    />
                  </div>
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
