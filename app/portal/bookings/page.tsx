import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { cancelBooking } from "@/app/actions/booking";
import { formatDay, formatTime, studioDateKey } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const session = await requireUser();
  const now = new Date();

  const rows = await db.query.bookings.findMany({
    where: eq(bookings.userId, session.userId),
    with: { session: { with: { classType: true, location: true } } },
    orderBy: [desc(bookings.createdAt)],
  });

  const upcoming = rows
    .filter((b) => b.status === "booked" && b.session.startsAt >= now && !b.session.canceled)
    .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime());

  const past = rows
    .filter((b) => !upcoming.includes(b))
    .sort((a, b) => b.session.startsAt.getTime() - a.session.startsAt.getTime());

  const monthGroups = new Map<string, typeof past>();
  for (const b of past) {
    const monthKey = studioDateKey(b.session.startsAt).slice(0, 7);
    if (!monthGroups.has(monthKey)) monthGroups.set(monthKey, []);
    monthGroups.get(monthKey)!.push(b);
  }
  const monthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    });
  };

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

      {monthGroups.size > 0 ? (
        <div className="space-y-6">
          <h2 className="font-display text-xl font-600">History</h2>
          {[...monthGroups.entries()].map(([monthKey, monthBookings]) => (
            <div key={monthKey}>
              <p className="mb-2 text-xs font-700 uppercase tracking-wide text-ink/40">
                {monthLabel(monthKey)}
              </p>
              <ul className="space-y-2">
                {monthBookings.map((b) => (
                  <li key={b.id} className="card flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-10 w-1.5 rounded-full"
                        style={{ background: b.session.classType.color }}
                      />
                      <div>
                        <p className="font-600">{b.session.classType.name}</p>
                        <p className="text-sm text-ink/50">
                          {b.session.location.name} · {formatDay(b.session.startsAt)}{" "}
                          {formatTime(b.session.startsAt)}
                        </p>
                      </div>
                    </div>
                    {b.status === "canceled" ? (
                      <span className="badge bg-blush text-magenta-deep">Canceled</span>
                    ) : b.session.canceled ? (
                      <span className="badge bg-amber-100 text-amber-700">Class canceled</span>
                    ) : (
                      <span className="badge bg-emerald-100 text-emerald-700">Attended</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
