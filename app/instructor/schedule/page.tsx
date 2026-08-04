import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, instructorLocations } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { formatDay, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InstructorSchedulePage() {
  const session = await requireInstructor();

  const myLocations = await db.query.instructorLocations.findMany({
    where: eq(instructorLocations.userId, session.userId),
    with: { location: true },
  });
  const myLocationIds = myLocations.map((l) => l.locationId);

  const now = new Date();
  const sessions =
    myLocationIds.length === 0
      ? []
      : await db.query.classSessions.findMany({
          where: and(
            inArray(classSessions.locationId, myLocationIds),
            gte(classSessions.startsAt, now)
          ),
          with: { classType: true, location: true, bookings: { with: { user: true } } },
          orderBy: [classSessions.startsAt],
          limit: 100,
        });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Schedule</h1>
        <p className="text-sm text-ink/50">Upcoming classes and who&apos;s booked in.</p>
      </div>

      {myLocations.length === 0 ? (
        <div className="card p-6 text-sm text-ink/50">
          You&apos;re not assigned to a studio yet. Ask an admin to assign one.
        </div>
      ) : sessions.length === 0 ? (
        <div className="card p-6 text-sm text-ink/40">Nothing upcoming.</div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const roster = s.bookings.filter((b) => b.status === "booked");
            return (
              <li key={s.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-9 w-1.5 shrink-0 rounded-full"
                      style={{ background: s.classType.color }}
                    />
                    <div>
                      <p className="font-600">
                        {s.classType.name}
                        {s.canceled ? (
                          <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink/50">
                            Canceled
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink/50">
                        {s.location.name} · {formatDay(s.startsAt)} {formatTime(s.startsAt)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-ink/50">
                    {roster.length}/{s.capacity} booked
                  </span>
                </div>

                {roster.length > 0 ? (
                  <ul className="mt-3 divide-y divide-ink/5 border-t border-ink/5 pt-2 text-sm">
                    {roster.map((b) => (
                      <li key={b.id} className="flex items-center justify-between py-1.5">
                        <span>{b.user.name}</span>
                        <span className="text-xs text-ink/40">{b.user.phone || b.user.email}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 border-t border-ink/5 pt-2 text-xs text-ink/40">
                    Nobody booked yet.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
