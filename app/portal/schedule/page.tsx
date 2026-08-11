import Link from "next/link";
import { and, gte, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { classSessions } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { getActiveMembership } from "@/lib/queries";
import { bookClass } from "@/app/actions/booking";
import { formatDay, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const session = await requireUser();
  const active = await getActiveMembership(session.userId);

  if (!active) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-600">Schedule</h1>
        <div className="card p-8 text-center">
          <p className="text-ink/60">You need an active package to see and book classes.</p>
          <Link href="/portal/packages" className="btn-primary mt-4">Browse packages</Link>
        </div>
      </div>
    );
  }

  const { membership, allowedLocationIds } = active;
  const now = new Date();
  // A class stays bookable until 30 minutes after it ends, not just until
  // it starts — covers walk-ins and last-minute bookings during class.
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000);

  const where =
    allowedLocationIds.length > 0
      ? and(
          gte(classSessions.endsAt, cutoff),
          eq(classSessions.canceled, false),
          inArray(classSessions.locationId, allowedLocationIds)
        )
      : and(gte(classSessions.endsAt, cutoff), eq(classSessions.canceled, false));

  const sessions = await db.query.classSessions.findMany({
    where,
    with: { classType: true, location: true, bookings: true },
    orderBy: [classSessions.startsAt],
    limit: 60,
  });

  const noCredits =
    membership.creditsRemaining !== null && membership.creditsRemaining <= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-600">Schedule</h1>
          <p className="text-sm text-ink/50">
            Classes included in {membership.package.name}.
          </p>
        </div>
        <span className="badge bg-blush text-magenta-deep">
          {membership.creditsRemaining === null
            ? "Unlimited"
            : `${membership.creditsRemaining} left`}
        </span>
      </div>

      {noCredits ? (
        <div className="rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800">
          You&apos;re out of class credits.{" "}
          <Link href="/portal/packages" className="font-semibold underline">Renew your package</Link> to keep dancing.
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <div className="card p-8 text-center text-ink/50">No upcoming classes scheduled.</div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const booked = s.bookings.filter((b) => b.status === "booked");
            const isBooked = booked.some((b) => b.userId === session.userId);
            const full = booked.length >= s.capacity;
            return (
              <li key={s.id} className="card flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-1.5 rounded-full" style={{ background: s.classType.color }} />
                  <div>
                    <p className="font-600">{s.classType.name}</p>
                    <p className="text-sm text-ink/50">
                      {s.location.name} · {formatDay(s.startsAt)} {formatTime(s.startsAt)}
                    </p>
                    <p className="text-xs text-ink/40">
                      {booked.length}/{s.capacity} booked
                      {s.instructor ? ` · ${s.instructor}` : ""}
                    </p>
                  </div>
                </div>
                {isBooked ? (
                  <span className="badge bg-emerald-100 text-emerald-700">Booked</span>
                ) : full ? (
                  <span className="badge bg-ink/10 text-ink/50">Full</span>
                ) : (
                  <form action={bookClass}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button className="btn-primary px-4 py-2 text-sm" disabled={noCredits}>
                      Book
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
