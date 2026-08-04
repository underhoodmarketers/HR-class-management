import Link from "next/link";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { getActiveMembership } from "@/lib/queries";
import { formatDay, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PortalHome({
  searchParams,
}: {
  searchParams: { purchase?: string };
}) {
  const session = await requireUser();
  const active = await getActiveMembership(session.userId);
  const now = new Date();

  const nextBooking = await db.query.bookings.findFirst({
    where: and(eq(bookings.userId, session.userId), eq(bookings.status, "booked")),
    with: { session: { with: { classType: true, location: true } } },
    orderBy: (b, { asc }) => [asc(b.createdAt)],
  });

  const upcoming =
    nextBooking && nextBooking.session.startsAt > now ? nextBooking : null;

  return (
    <div className="space-y-6">
      {searchParams.purchase === "success" ? (
        <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          Payment received — your membership is active. Time to book a class!
        </div>
      ) : null}

      <div className="rounded-3xl bg-brand-gradient p-6 text-white shadow-card">
        <p className="text-sm text-white/70">Your membership</p>
        {active ? (
          <>
            <p className="mt-1 font-display text-2xl font-600">{active.membership.package.name}</p>
            <div className="mt-4 flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-white/60">Classes left</p>
                <p className="text-lg font-600">
                  {active.membership.creditsRemaining === null
                    ? "Unlimited"
                    : active.membership.creditsRemaining}
                </p>
              </div>
              <div>
                <p className="text-white/60">Renews / ends</p>
                <p className="text-lg font-600">{formatDay(active.membership.endsAt)}</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 font-display text-2xl font-600">No active package</p>
            <Link href="/portal/packages" className="mt-4 inline-flex btn bg-white text-magenta-deep">
              Browse packages
            </Link>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="text-sm text-ink/50">Next class</p>
          {upcoming ? (
            <>
              <p className="mt-1 font-600">{upcoming.session.classType.name}</p>
              <p className="text-sm text-ink/50">
                {upcoming.session.location.name} · {formatDay(upcoming.session.startsAt)}{" "}
                {formatTime(upcoming.session.startsAt)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink/40">
              Nothing booked.{" "}
              <Link href="/portal/schedule" className="text-magenta">See the schedule.</Link>
            </p>
          )}
        </div>
        <div className="card flex flex-col justify-between p-5">
          <p className="text-sm text-ink/50">Ready to move?</p>
          <Link href="/portal/schedule" className="btn-primary mt-3 w-fit">
            Book a class
          </Link>
        </div>
      </div>
    </div>
  );
}
