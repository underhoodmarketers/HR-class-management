import Link from "next/link";
import { and, gte, eq, count, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, classSessions, memberships, locations, userLocations } from "@/db/schema";
import { formatDay, formatTime } from "@/lib/utils";
import AdminBulkEmailForm from "@/components/AdminBulkEmailForm";

export const dynamic = "force-dynamic";

const emailErrorMessages: Record<string, string> = {
  email_invalid: "Fill in a subject and a message.",
  email_no_recipients: "No customers match that filter.",
};

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: { error?: string; email_sent?: string };
}) {
  const now = new Date();

  const [[{ value: customerCount }], [{ value: activeMembers }], upcoming, allLocations, customersByLocation] =
    await Promise.all([
      db.select({ value: count() }).from(users).where(eq(users.role, "customer")),
      db
        .select({ value: count() })
        .from(memberships)
        .where(eq(memberships.status, "active")),
      db.query.classSessions.findMany({
        where: and(gte(classSessions.startsAt, now), eq(classSessions.canceled, false)),
        with: { classType: true, location: true, bookings: true },
        orderBy: [classSessions.startsAt],
        limit: 6,
      }),
      db.select().from(locations).where(and(eq(locations.active, true), isNull(locations.archivedAt))),
      db
        .select({ locationId: userLocations.locationId, value: count() })
        .from(userLocations)
        .innerJoin(users, eq(users.id, userLocations.userId))
        .where(eq(users.role, "customer"))
        .groupBy(userLocations.locationId),
    ]);

  const stats = [
    { label: "Customers", value: customerCount },
    { label: "Active memberships", value: activeMembers },
    { label: "Upcoming classes", value: upcoming.length },
  ];

  const countByLocation = new Map(customersByLocation.map((c) => [c.locationId, c.value]));
  const studioOptions = allLocations.map((l) => ({
    id: l.id,
    name: l.name,
    customerCount: countByLocation.get(l.id) ?? 0,
  }));

  const banner =
    searchParams.error && emailErrorMessages[searchParams.error]
      ? { tone: "error" as const, text: emailErrorMessages[searchParams.error] }
      : searchParams.email_sent
      ? { tone: "ok" as const, text: `Email sent to ${searchParams.email_sent} customer${searchParams.email_sent === "1" ? "" : "s"}.` }
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Dashboard</h1>
        <p className="text-sm text-ink/50">Your studio at a glance.</p>
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
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-sm text-ink/50">{s.label}</p>
            <p className="mt-1 font-display text-3xl font-600 text-magenta">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-600">Next classes</h2>
          <Link href="/admin/calendar" className="text-sm font-semibold text-magenta">
            Manage calendar →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink/50">
            No upcoming classes yet.{" "}
            <Link href="/admin/calendar" className="text-magenta">Schedule one.</Link>
          </p>
        ) : (
          <ul className="divide-y divide-ink/5">
            {upcoming.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-1.5 rounded-full"
                    style={{ background: s.classType.color }}
                  />
                  <div>
                    <p className="font-medium">{s.classType.name}</p>
                    <p className="text-xs text-ink/50">{s.location.name}</p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">{formatDay(s.startsAt)}</p>
                  <p className="text-ink/50">
                    {formatTime(s.startsAt)} · {s.bookings.filter((b) => b.status === "booked").length}/
                    {s.capacity} booked
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-600">Email customers</h2>
        <AdminBulkEmailForm studios={studioOptions} totalCount={customerCount} />
      </div>
    </div>
  );
}
