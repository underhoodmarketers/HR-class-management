import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, gt, gte } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, memberships, users } from "@/db/schema";
import { formatDay, formatTime, studioDateKey } from "@/lib/utils";
import AddCustomerToClass from "@/components/AddCustomerToClass";
import SessionRosterTabs from "@/components/SessionRosterTabs";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const sessionId = Number(params.id);
  if (!sessionId) notFound();

  const now = new Date();

  const [session, customers, activeMembershipRows] = await Promise.all([
    db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: {
        classType: true,
        location: true,
        assignedInstructor: true,
        bookings: { with: { user: true, membership: { with: { package: true } } } },
      },
    }),
    db.query.users.findMany({
      where: eq(users.role, "customer"),
      columns: { id: true, name: true, makeupCredits: true },
      orderBy: (u, { asc }) => [asc(u.name)],
    }),
    db.query.memberships.findMany({
      where: and(eq(memberships.status, "active"), gt(memberships.endsAt, now)),
      columns: { userId: true, creditsRemaining: true },
      orderBy: [desc(memberships.endsAt)],
    }),
  ]);

  if (!session) notFound();

  // Latest-ending active membership per customer — mirrors getActiveMembership.
  const activeByUser = new Map<number, { creditsRemaining: number | null }>();
  for (const m of activeMembershipRows) {
    if (!activeByUser.has(m.userId)) {
      activeByUser.set(m.userId, { creditsRemaining: m.creditsRemaining });
    }
  }
  const hasCreditsByUser = new Map<number, boolean>(
    customers.map((c) => {
      const active = activeByUser.get(c.id);
      const hasCredits = active
        ? active.creditsRemaining === null ||
          active.creditsRemaining > 0 ||
          c.makeupCredits > 0
        : false;
      return [c.id, hasCredits];
    })
  );

  let seriesRemaining = 0;
  if (session.seriesId) {
    const [{ c }] = await db
      .select({ c: count() })
      .from(classSessions)
      .where(
        and(
          eq(classSessions.seriesId, session.seriesId),
          gte(classSessions.startsAt, session.startsAt)
        )
      );
    seriesRemaining = c;
  }

  const activeBookings = session.bookings.filter((b) => b.status === "booked");
  const cancelledBookings = session.bookings.filter((b) => b.status === "canceled");
  const toRosterEntry = (b: (typeof session.bookings)[number]) => ({
    bookingId: b.id,
    userId: b.userId,
    name: b.user.name,
    contact: b.user.phone || b.user.email,
    packageName: b.membership?.package.name ?? null,
    signedUpAt: b.createdAt,
    owesCredit: b.fromOwedCredit,
  });
  const roster = activeBookings.map(toRosterEntry);
  const cancelledRoster = cancelledBookings.map(toRosterEntry);
  // Admin can (with confirmation) book someone who's already in this class
  // a second time, so the picker includes everyone, not just who's free.
  const alreadyBookedUserIds = new Set(roster.map((r) => r.userId));

  const durationMin = Math.round(
    (session.endsAt.getTime() - session.startsAt.getTime()) / 60000
  );
  const dayKey = studioDateKey(session.startsAt);

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/calendar?month=${dayKey.slice(0, 7)}&day=${dayKey}#agenda`}
        className="text-sm text-ink/50 hover:text-magenta-deep"
      >
        ← Back to calendar
      </Link>

      <div>
        <h1 className="font-display text-3xl font-600">
          {session.classType.name}
          {session.canceled ? (
            <span className="ml-3 rounded-full bg-ink/10 px-3 py-1 align-middle text-sm font-normal text-ink/50">
              Canceled
            </span>
          ) : null}
          {session.seriesId ? (
            <span className="ml-2 rounded-full bg-blush px-3 py-1 align-middle text-sm font-normal text-magenta-deep">
              Series
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-ink/50">
          {session.location.name} · {formatDay(session.startsAt)}{" "}
          {formatTime(session.startsAt)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Signups"
          value={`${activeBookings.length}/${session.capacity}`}
        />
        <StatCard label="Duration" value={`${durationMin} min`} />
        <StatCard label="Cancelled" value={cancelledBookings.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 font-600">General info</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Class" value={session.classType.name} />
            <Row label="Date" value={formatDay(session.startsAt)} />
            <Row
              label="Time"
              value={`${formatTime(session.startsAt)} – ${formatTime(session.endsAt)}`}
            />
            <Row label="Location" value={session.location.name} />
            <Row
              label="Instructor"
              value={
                session.assignedInstructor?.name ?? session.instructor ?? "Unassigned"
              }
            />
            <Row label="Capacity" value={`${session.capacity} spots`} />
            {session.seriesId ? (
              <Row
                label="Series"
                value={`${seriesRemaining} class${
                  seriesRemaining === 1 ? "" : "es"
                } remaining, including this one`}
              />
            ) : null}
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="mb-4 font-600">Add customer into this class</h2>
          <AddCustomerToClass
            sessionId={session.id}
            customers={customers.map((c) => ({
              id: c.id,
              name: c.name,
              hasCredits: hasCreditsByUser.get(c.id) ?? false,
              alreadyBooked: alreadyBookedUserIds.has(c.id),
            }))}
            full={activeBookings.length >= session.capacity}
          />
        </div>
      </div>

      <div className="card p-6">
        <SessionRosterTabs roster={roster} cancelledRoster={cancelledRoster} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-5 text-center">
      <p className="text-2xl font-600 text-magenta-deep">{value}</p>
      <p className="text-xs text-ink/40">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink/40">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
