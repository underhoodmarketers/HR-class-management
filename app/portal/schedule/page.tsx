import Link from "next/link";
import { and, gte, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, locations, users } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { getActiveMembership } from "@/lib/queries";
import { DROP_IN_PACKAGE_NAME, formatDay } from "@/lib/utils";
import PortalScheduleList from "@/components/PortalScheduleList";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { loc?: string };
}) {
  const session = await requireUser();
  // requireStarted:false so a package that's paid for but hasn't started
  // yet still shows here — the schedule is always visible to everyone,
  // dates before it starts just can't be booked (see `bookable` below).
  const [active, profile] = await Promise.all([
    getActiveMembership(session.userId, { requireStarted: false }),
    db.query.users.findFirst({
      where: eq(users.id, session.userId),
      columns: { makeupCredits: true },
    }),
  ]);

  const now = new Date();
  // A class stays bookable until 30 minutes after it ends, not just until
  // it starts — covers walk-ins and last-minute bookings during class.
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000);

  const allowedLocationIds = active?.allowedLocationIds ?? [];

  // Studios this package can be used at — every active studio if
  // unrestricted (including having no package at all), otherwise just the
  // allowed ones — for the location filter tabs.
  const myLocations =
    allowedLocationIds.length > 0
      ? await db.query.locations.findMany({ where: inArray(locations.id, allowedLocationIds) })
      : await db.query.locations.findMany({ where: and(eq(locations.active, true), isNull(locations.archivedAt)) });
  const sortedLocations = [...myLocations].sort((a, b) => a.name.localeCompare(b.name));

  const selectedLocationId = searchParams.loc ? Number(searchParams.loc) : null;
  const effectiveLocationIds =
    selectedLocationId && sortedLocations.some((l) => l.id === selectedLocationId)
      ? [selectedLocationId]
      : allowedLocationIds;

  const where =
    effectiveLocationIds.length > 0
      ? and(
          gte(classSessions.endsAt, cutoff),
          eq(classSessions.canceled, false),
          inArray(classSessions.locationId, effectiveLocationIds)
        )
      : and(gte(classSessions.endsAt, cutoff), eq(classSessions.canceled, false));

  const sessions = await db.query.classSessions.findMany({
    where,
    with: { classType: true, location: true, bookings: true },
    orderBy: [classSessions.startsAt],
    limit: 60,
  });

  // A Drop-In is a standalone single class — it never draws from the
  // makeup pool, so while it's the active package, makeup credits (even
  // if banked) aren't offered as a way to book.
  const isDropIn = active?.membership.package.name === DROP_IN_PACKAGE_NAME;
  const makeupCredits = profile?.makeupCredits ?? 0;
  const hasRegularCredit = active
    ? active.membership.creditsRemaining === null || active.membership.creditsRemaining > 0
    : false;
  const hasMakeupCredit = active ? !isDropIn && makeupCredits > 0 : false;
  const hasCredits = hasRegularCredit || hasMakeupCredit;
  const notStartedYet = Boolean(active && active.membership.startsAt > now);

  const banner = !active
    ? {
        tone: "info" as const,
        text: (
          <>
            You don&apos;t have an active package yet.{" "}
            <Link href="/portal/packages" className="font-semibold underline">Browse packages</Link> to start booking.
          </>
        ),
      }
    : notStartedYet
    ? {
        tone: "info" as const,
        text: `Your ${active.membership.package.name} package starts ${formatDay(
          active.membership.startsAt
        )} — you can already book classes from that date onward; earlier ones are shown but can't be booked.`,
      }
    : !hasCredits
    ? {
        tone: "warning" as const,
        text: (
          <>
            You&apos;re out of class credits.{" "}
            <Link href="/portal/packages" className="font-semibold underline">Renew your package</Link> to keep dancing.
          </>
        ),
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-600">Schedule</h1>
          <p className="text-sm text-ink/50">
            {active ? `Classes included in ${active.membership.package.name}.` : "Browse upcoming classes."}
          </p>
        </div>
        {active ? (
          <div className="flex gap-1.5">
            <span className="badge bg-blush text-magenta-deep">
              {active.membership.creditsRemaining === null
                ? "Unlimited"
                : `${active.membership.creditsRemaining} left`}
            </span>
            {hasMakeupCredit ? (
              <span className="badge bg-sky-100 text-sky-700">
                {makeupCredits} makeup credit{makeupCredits === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {banner ? (
        <div
          className={`rounded-2xl px-5 py-4 text-sm ${
            banner.tone === "warning" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {sortedLocations.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 border-b border-ink/5 pb-3">
          <Link
            href="/portal/schedule"
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              !selectedLocationId ? "bg-magenta text-white" : "bg-blush/40 text-ink/60 hover:bg-blush"
            }`}
          >
            All studios
          </Link>
          {sortedLocations.map((l) => (
            <Link
              key={l.id}
              href={`/portal/schedule?loc=${l.id}`}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                selectedLocationId === l.id ? "bg-magenta text-white" : "bg-blush/40 text-ink/60 hover:bg-blush"
              }`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      ) : null}

      <PortalScheduleList
        sessions={sessions.map((s) => {
          const booked = s.bookings.filter((b) => b.status === "booked");
          const myBooking = booked.find((b) => b.userId === session.userId) ?? null;
          // A queued future package can be pre-booked ahead for classes
          // on/after its own start date — matches what bookClass allows.
          const bookable =
            Boolean(active) && s.startsAt >= (active?.membership.startsAt ?? now) && hasCredits;
          return {
            id: s.id,
            classTypeName: s.classType.name,
            classTypeColor: s.classType.color,
            locationName: s.location.name,
            startsAt: s.startsAt,
            instructor: s.instructor,
            bookedCount: booked.length,
            capacity: s.capacity,
            isBooked: myBooking !== null,
            bookingId: myBooking?.id ?? null,
            bookable,
          };
        })}
        hasRegularCredit={hasRegularCredit}
        hasMakeupCredit={hasMakeupCredit}
        makeupCredits={makeupCredits}
      />
    </div>
  );
}
