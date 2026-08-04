import Link from "next/link";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { cancelBooking } from "@/app/actions/booking";
import { formatDay, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const session = await requireUser();
  const now = new Date();

  const rows = await db.query.bookings.findMany({
    where: and(eq(bookings.userId, session.userId), eq(bookings.status, "booked")),
    with: { session: { with: { classType: true, location: true } } },
    orderBy: [desc(bookings.createdAt)],
  });

  const upcoming = rows
    .filter((b) => b.session.startsAt >= now && !b.session.canceled)
    .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">My classes</h1>
        <p className="text-sm text-ink/50">Your upcoming bookings.</p>
      </div>

      {upcoming.length === 0 ? (
        <div className="card p-8 text-center text-ink/50">
          Nothing booked yet.{" "}
          <Link href="/portal/schedule" className="text-magenta">Find a class.</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((b) => (
            <li key={b.id} className="card flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="h-10 w-1.5 rounded-full" style={{ background: b.session.classType.color }} />
                <div>
                  <p className="font-600">{b.session.classType.name}</p>
                  <p className="text-sm text-ink/50">
                    {b.session.location.name} · {formatDay(b.session.startsAt)}{" "}
                    {formatTime(b.session.startsAt)}
                  </p>
                </div>
              </div>
              <form action={cancelBooking}>
                <input type="hidden" name="bookingId" value={b.id} />
                <button className="btn-subtle px-4 py-2 text-sm">Cancel</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
