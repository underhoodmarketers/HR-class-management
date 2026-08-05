import Link from "next/link";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, instructorLocations, users } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { formatDay, formatTime, formatBirthday, daysUntilBirthday } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export default async function InstructorDashboardPage() {
  const session = await requireInstructor();
  const now = new Date();

  const myLocations = await db.query.instructorLocations.findMany({
    where: eq(instructorLocations.userId, session.userId),
    with: { location: true },
  });
  const myLocationIds = myLocations.map((l) => l.locationId);
  const myLocationIdSet = new Set(myLocationIds);
  const myLocationNames = myLocations.map((l) => l.location.name).join(", ");
  const hasLocations = myLocationIds.length > 0;
  const locationFilter = hasLocations ? myLocationIds : [-1];

  const visibleToMe = or(
    isNull(classSessions.assignedInstructorId),
    eq(classSessions.assignedInstructorId, session.userId)
  );

  const [customers, upNext] = await Promise.all([
    db.query.users.findMany({
      where: eq(users.role, "customer"),
      with: {
        memberships: { with: { package: { with: { locations: true } } } },
      },
      orderBy: (u, { asc }) => [asc(u.name)],
    }),
    db.query.classSessions.findFirst({
      where: and(
        inArray(classSessions.locationId, locationFilter),
        visibleToMe,
        gt(classSessions.startsAt, now),
        eq(classSessions.canceled, false)
      ),
      with: { classType: true, location: true, bookings: { with: { user: true } } },
      orderBy: [classSessions.startsAt],
    }),
  ]);

  // A customer is "yours" if any membership's package includes one of your
  // studios, or the package has no studio restriction (valid everywhere).
  const scoped = customers.filter((c) =>
    c.memberships.some((m) => {
      const pkgLocations = m.package.locations;
      return (
        pkgLocations.length === 0 ||
        pkgLocations.some((pl) => myLocationIdSet.has(pl.locationId))
      );
    })
  );

  const birthdaysThisWeek = scoped
    .filter((c) => c.dob && daysUntilBirthday(c.dob) <= 6)
    .sort((a, b) => daysUntilBirthday(a.dob!) - daysUntilBirthday(b.dob!));

  const expiringMemberships = scoped
    .flatMap((c) =>
      c.memberships
        .filter(
          (m) =>
            m.status === "active" &&
            m.endsAt.getTime() > now.getTime() &&
            m.endsAt.getTime() <= now.getTime() + TWO_WEEKS_MS
        )
        .map((m) => ({ customer: c, membership: m }))
    )
    .sort((a, b) => a.membership.endsAt.getTime() - b.membership.endsAt.getTime());

  const upNextBooked = upNext
    ? upNext.bookings.filter((b) => b.status === "booked").length
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Dashboard</h1>
        <p className="text-sm text-ink/50">{myLocationNames || "No studio assigned yet"}</p>
      </div>

      {!hasLocations ? (
        <div className="card p-6 text-sm text-ink/50">
          You&apos;re not assigned to a studio yet. Ask an admin to assign one.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <p className="text-sm text-ink/50">Customers at your studio</p>
              <p className="mt-1 font-display text-3xl font-600 text-magenta">{scoped.length}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-ink/50">Booked for your next class</p>
              <p className="mt-1 font-display text-3xl font-600 text-magenta">
                {upNext ? `${upNextBooked}/${upNext.capacity}` : "—"}
              </p>
              {upNext ? (
                <p className="mt-1 text-xs text-ink/40">
                  {upNext.classType.name} · {upNext.location.name} · {formatDay(upNext.startsAt)}{" "}
                  {formatTime(upNext.startsAt)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink/40">Nothing upcoming.</p>
              )}
            </div>
            <div className="card p-5">
              <p className="text-sm text-ink/50">Memberships expiring within 2 weeks</p>
              <p className="mt-1 font-display text-3xl font-600 text-magenta">
                {expiringMemberships.length}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <h2 className="mb-4 font-600">Birthdays this week</h2>
              {birthdaysThisWeek.length === 0 ? (
                <p className="text-sm text-ink/40">No birthdays this week.</p>
              ) : (
                <ul className="divide-y divide-ink/5 text-sm">
                  {birthdaysThisWeek.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2">
                      <span>{c.name}</span>
                      <span className="text-xs text-ink/50">
                        {daysUntilBirthday(c.dob!) === 0 ? "Today 🎉" : formatBirthday(c.dob)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-6">
              <h2 className="mb-4 font-600">Membership expiring soon</h2>
              {expiringMemberships.length === 0 ? (
                <p className="text-sm text-ink/40">Nothing expiring in the next 2 weeks.</p>
              ) : (
                <ul className="divide-y divide-ink/5 text-sm">
                  {expiringMemberships.map(({ customer, membership }) => (
                    <li key={membership.id} className="flex items-center justify-between py-2">
                      <div>
                        <p>{customer.name}</p>
                        <p className="text-xs text-ink/40">{membership.package.name}</p>
                      </div>
                      <span className="text-xs text-ink/50">
                        Last day {formatDay(membership.endsAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-600">Up next</h2>
              <Link href="/instructor/schedule" className="text-sm font-semibold text-magenta">
                Full schedule →
              </Link>
            </div>
            {upNext ? (
              <ul className="divide-y divide-ink/5 text-sm">
                {upNext.bookings
                  .filter((b) => b.status === "booked")
                  .map((b) => (
                    <li key={b.id} className="flex items-center justify-between py-2">
                      <span>{b.user.name}</span>
                      <span className="text-xs text-ink/40">{b.user.phone || b.user.email}</span>
                    </li>
                  ))}
                {upNext.bookings.filter((b) => b.status === "booked").length === 0 ? (
                  <li className="py-2 text-ink/40">Nobody booked yet.</li>
                ) : null}
              </ul>
            ) : (
              <p className="text-sm text-ink/40">Nothing upcoming.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
