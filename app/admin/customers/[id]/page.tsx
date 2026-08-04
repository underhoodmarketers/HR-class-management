import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { users, bookings } from "@/db/schema";
import { formatDay, formatMoney, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (isNaN(id)) notFound();

  const customer = await db.query.users.findFirst({
    where: eq(users.id, id),
    with: {
      memberships: { with: { package: true } },
      signatures: true,
    },
  });
  if (!customer || customer.role !== "customer") notFound();

  const myBookings = await db.query.bookings.findMany({
    where: eq(bookings.userId, id),
    with: { session: { with: { classType: true, location: true } } },
    orderBy: [desc(bookings.createdAt)],
    limit: 20,
  });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/customers" className="text-sm text-magenta">← All customers</Link>
        <h1 className="mt-2 font-display text-3xl font-600">{customer.name}</h1>
        <p className="text-sm text-ink/50">Joined {formatDay(customer.createdAt)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6">
          <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-ink/50">Contact</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-ink/40">Email</dt><dd>{customer.email}</dd></div>
            <div><dt className="text-ink/40">Phone</dt><dd>{customer.phone || "—"}</dd></div>
            <div><dt className="text-ink/40">Emergency</dt><dd>{customer.emergencyContact || "—"}</dd></div>
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-ink/50">Waiver</h2>
          {customer.signatures.length ? (
            customer.signatures.map((s) => (
              <p key={s.id} className="text-sm">
                Signed “{s.signedName}” · v{s.version} · {formatDay(s.signedAt)}
              </p>
            ))
          ) : (
            <p className="text-sm text-amber-600">Not signed yet.</p>
          )}
        </div>

        <div className="card p-6">
          <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-ink/50">Memberships</h2>
          {customer.memberships.length ? (
            <ul className="space-y-2 text-sm">
              {customer.memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between">
                  <span>{m.package.name} <span className="text-ink/40">({formatMoney(m.package.priceCents)})</span></span>
                  <span className="badge bg-blush text-magenta-deep">{m.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink/40">No memberships.</p>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-600">Booking history</h2>
        {myBookings.length ? (
          <ul className="divide-y divide-ink/5 text-sm">
            {myBookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5">
                <span>{b.session.classType.name} · {b.session.location.name}</span>
                <span className="text-ink/50">
                  {formatDay(b.session.startsAt)} {formatTime(b.session.startsAt)}
                  {b.status === "canceled" ? " · canceled" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink/40">No bookings yet.</p>
        )}
      </div>
    </div>
  );
}
