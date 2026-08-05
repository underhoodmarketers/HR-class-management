import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations, users, bookings, packages } from "@/db/schema";
import { formatDay, formatMoney, formatTime } from "@/lib/utils";
import { deleteCustomer } from "@/app/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";
import EditCustomerCard from "@/components/EditCustomerCard";
import MembershipCard from "@/components/MembershipCard";
import MakeupCreditsCard from "@/components/MakeupCreditsCard";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid: "Fill in name, email, phone, date of birth, and preferred studio.",
  exists: "Another account already uses that email.",
  membership_invalid: "Fill in a package, valid dates, and non-negative credits.",
  makeup_invalid: "Makeup credits must be a whole number, 0 or more.",
};

export default async function CustomerDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    created?: string;
    updated?: string;
    error?: string;
    membership_updated?: string;
    makeup_updated?: string;
  };
}) {
  const id = Number(params.id);
  if (isNaN(id)) notFound();

  const [customer, studios, allPackages] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, id),
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
    db.select().from(packages),
  ]);
  if (!customer || customer.role !== "customer") notFound();

  const now = new Date();
  const allBookings = await db.query.bookings.findMany({
    where: eq(bookings.userId, id),
    with: { session: { with: { classType: true, location: true } } },
    orderBy: [desc(bookings.createdAt)],
  });
  const myBookings = allBookings.slice(0, 20);

  const attended = (b: (typeof allBookings)[number]) =>
    b.status === "booked" && b.session.startsAt < now;

  const currentMembership = customer.memberships[0] ?? null;
  const attendedInPackage = currentMembership
    ? allBookings.filter((b) => attended(b) && b.membershipId === currentMembership.id).length
    : 0;
  const totalAttended = allBookings.filter(attended).length;

  const banner =
    searchParams.error && errorMessages[searchParams.error]
      ? { tone: "error" as const, text: errorMessages[searchParams.error] }
      : searchParams.created
      ? { tone: "ok" as const, text: "Customer created." }
      : searchParams.updated
      ? { tone: "ok" as const, text: "Customer updated." }
      : searchParams.membership_updated
      ? { tone: "ok" as const, text: "Membership updated." }
      : searchParams.makeup_updated
      ? { tone: "ok" as const, text: "Makeup credits updated." }
      : null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/customers" className="text-sm text-magenta">← All customers</Link>
          <h1 className="mt-2 font-display text-3xl font-600">{customer.name}</h1>
          <p className="text-sm text-ink/50">Joined {formatDay(customer.createdAt)}</p>
        </div>
        <ConfirmDeleteButton
          id={customer.id}
          action={deleteCustomer}
          confirmText={`Delete ${customer.name}?\n\nThis removes their account, memberships, bookings, and waiver record. This can't be undone.`}
          className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
        />
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

      <div className="grid gap-6 lg:grid-cols-3">
        <EditCustomerCard
          customer={{
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            dob: customer.dob,
            instagram: customer.instagram,
            locationId: customer.locationId,
          }}
          studios={studios}
        />

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

        <MembershipCard
          customerId={customer.id}
          membership={
            currentMembership
              ? {
                  id: currentMembership.id,
                  packageId: currentMembership.packageId,
                  packageName: currentMembership.package.name,
                  status: currentMembership.status,
                  creditsRemaining: currentMembership.creditsRemaining,
                  startsAt: currentMembership.startsAt,
                  endsAt: currentMembership.endsAt,
                  billingType: currentMembership.billingType,
                }
              : null
          }
          packages={allPackages.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents }))}
          attendedInPackage={attendedInPackage}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <MakeupCreditsCard
          customerId={customer.id}
          makeupCredits={customer.makeupCredits}
          packageCreditsRemaining={currentMembership?.creditsRemaining ?? null}
          totalAttended={totalAttended}
        />

        {customer.memberships.length > 1 ? (
          <div className="card p-6 lg:col-span-2">
            <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-ink/50">
              Membership history
            </h2>
            <ul className="divide-y divide-ink/5 text-sm">
              {customer.memberships.slice(1).map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <span>
                    {m.package.name}{" "}
                    <span className="text-ink/40">({formatMoney(m.package.priceCents)})</span>
                  </span>
                  <span className="text-right text-ink/50">
                    {formatDay(m.startsAt)} – {formatDay(m.endsAt)}
                    <span className="badge ml-2 bg-blush text-magenta-deep">{m.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
