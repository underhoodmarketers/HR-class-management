import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { deleteCustomer } from "@/app/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { deleted?: string };
}) {
  const customers = await db.query.users.findMany({
    where: eq(users.role, "customer"),
    orderBy: [desc(users.createdAt)],
    with: {
      memberships: { with: { package: true } },
      signatures: true,
      location: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-600">Customers</h1>
          <p className="text-sm text-ink/50">{customers.length} members</p>
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

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-blush/50 text-left text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Contact</th>
              <th className="px-5 py-3 font-semibold">Studio</th>
              <th className="px-5 py-3 font-semibold">Membership</th>
              <th className="px-5 py-3 font-semibold">Waiver</th>
              <th className="px-5 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {customers.map((c) => {
              const active = c.memberships.find((m) => m.status === "active");
              return (
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
                    {active ? (
                      <span className="badge bg-magenta/10 text-magenta-deep">{active.package.name}</span>
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
                  <td className="px-5 py-3 text-right">
                    <ConfirmDeleteButton
                      id={c.id}
                      action={deleteCustomer}
                      confirmText={`Delete ${c.name}?\n\nThis removes their account, memberships, bookings, and waiver record. This can't be undone.`}
                      className="rounded-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    />
                  </td>
                </tr>
              );
            })}
            {customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-ink/40">
                  No customers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
