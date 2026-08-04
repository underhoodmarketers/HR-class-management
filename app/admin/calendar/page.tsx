import { and, gte, eq } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, classTypes, locations } from "@/db/schema";
import { createSession, cancelSession, deleteSession } from "@/app/actions/admin";
import { formatDay, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const now = new Date();
  const [types, studios, sessions] = await Promise.all([
    db.select().from(classTypes),
    db.select().from(locations).where(eq(locations.active, true)),
    db.query.classSessions.findMany({
      where: gte(classSessions.startsAt, new Date(now.getTime() - 12 * 60 * 60 * 1000)),
      with: { classType: true, location: true, bookings: true },
      orderBy: [classSessions.startsAt],
      limit: 100,
    }),
  ]);

  const canSchedule = types.length > 0 && studios.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Calendar</h1>
        <p className="text-sm text-ink/50">Schedule classes across your studios.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        {/* Schedule form */}
        <div className="card h-fit p-6">
          <h2 className="mb-4 font-600">Schedule a class</h2>
          {canSchedule ? (
            <form action={createSession} className="space-y-4">
              <div>
                <label className="label">Class</label>
                <select name="classTypeId" className="input" required>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Studio</label>
                <select name="locationId" className="input" required>
                  {studios.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Starts at</label>
                <input type="datetime-local" name="startsAt" className="input" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Minutes</label>
                  <input type="number" name="durationMin" defaultValue={60} min={15} className="input" />
                </div>
                <div>
                  <label className="label">Capacity</label>
                  <input type="number" name="capacity" defaultValue={20} min={1} className="input" />
                </div>
              </div>
              <div>
                <label className="label">Instructor (optional)</label>
                <input name="instructor" className="input" placeholder="e.g. Pre" />
              </div>
              <div>
                <label className="label">Repeat weekly for</label>
                <input type="number" name="repeatWeeks" defaultValue={1} min={1} max={52} className="input" />
                <p className="mt-1 text-xs text-ink/40">Set to 8 to create the same class for 8 weeks.</p>
              </div>
              <button className="btn-primary w-full">Add to calendar</button>
            </form>
          ) : (
            <p className="text-sm text-ink/50">
              Add at least one class and one studio first on the{" "}
              <a href="/admin/locations" className="text-magenta">Studios &amp; classes</a> page.
            </p>
          )}
        </div>

        {/* Upcoming list */}
        <div className="card p-6">
          <h2 className="mb-4 font-600">Scheduled classes</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-ink/50">Nothing scheduled yet.</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {sessions.map((s) => {
                const booked = s.bookings.filter((b) => b.status === "booked").length;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-1.5 rounded-full" style={{ background: s.classType.color }} />
                      <div>
                        <p className="font-medium">
                          {s.classType.name}
                          {s.canceled ? (
                            <span className="badge ml-2 bg-ink/10 text-ink/60">Canceled</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-ink/50">
                          {s.location.name} · {formatDay(s.startsAt)} {formatTime(s.startsAt)} · {booked}/{s.capacity}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!s.canceled ? (
                        <form action={cancelSession}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className="btn-subtle px-3 py-1.5 text-xs">Cancel</button>
                        </form>
                      ) : null}
                      <form action={deleteSession}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="btn px-3 py-1.5 text-xs text-ink/40 hover:text-magenta">Delete</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
