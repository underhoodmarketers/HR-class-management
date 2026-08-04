import { and, gte, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, classTypes, locations } from "@/db/schema";
import { createSession } from "@/app/actions/admin";
import {
  formatDay,
  formatTime,
  formatDateTimeLocalValue,
} from "@/lib/utils";
import WeekdayPicker from "@/components/WeekdayPicker";
import SessionRow from "@/components/SessionRow";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: {
    created?: string;
    updated?: string;
    deleted?: string;
    refunded?: string;
    error?: string;
  };
}) {
  const now = new Date();
  const [types, studios, sessions] = await Promise.all([
    db.select().from(classTypes),
    db
      .select()
      .from(locations)
      .where(and(eq(locations.active, true), isNull(locations.archivedAt))),
    db.query.classSessions.findMany({
      where: gte(
        classSessions.startsAt,
        new Date(now.getTime() - 12 * 60 * 60 * 1000)
      ),
      with: { classType: true, location: true, bookings: true },
      orderBy: [classSessions.startsAt],
      limit: 200,
    }),
  ]);

  const canSchedule = types.length > 0 && studios.length > 0;

  const seriesCounts = new Map<string, number>();
  for (const s of sessions) {
    if (!s.seriesId) continue;
    seriesCounts.set(s.seriesId, (seriesCounts.get(s.seriesId) ?? 0) + 1);
  }
  const seenSoFar = new Map<string, number>();

  const banner =
    searchParams.error === "invalid"
      ? {
          tone: "error" as const,
          text: "Please pick a class, studio, and a valid start time.",
        }
      : searchParams.error === "not_series"
      ? { tone: "error" as const, text: "That class isn't part of a series." }
      : searchParams.created
      ? {
          tone: "ok" as const,
          text: `${searchParams.created} class${
            searchParams.created === "1" ? "" : "es"
          } added to your calendar.`,
        }
      : searchParams.updated
      ? {
          tone: "ok" as const,
          text: `${searchParams.updated} class${
            searchParams.updated === "1" ? "" : "es"
          } updated.`,
        }
      : searchParams.deleted
      ? {
          tone: "ok" as const,
          text: `${searchParams.deleted} class${
            searchParams.deleted === "1" ? "" : "es"
          } deleted. ${searchParams.refunded ?? 0} credit${
            searchParams.refunded === "1" ? "" : "s"
          } refunded.`,
        }
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Calendar</h1>
        <p className="text-sm text-ink/50">
          Schedule classes across your studios. All times are Central.
        </p>
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

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <div className="card h-fit p-6">
          <h2 className="mb-4 font-600">Schedule a class</h2>
          {canSchedule ? (
            <form action={createSession} className="space-y-4">
              <div>
                <label className="label">Class</label>
                <select name="classTypeId" className="input" required>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Studio</label>
                <select name="locationId" className="input" required>
                  {studios.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">First class starts at</label>
                <input
                  type="datetime-local"
                  name="startsAt"
                  className="input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Minutes</label>
                  <input
                    type="number"
                    name="durationMin"
                    defaultValue={60}
                    min={15}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Capacity</label>
                  <input
                    type="number"
                    name="capacity"
                    defaultValue={20}
                    min={1}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Instructor (optional)</label>
                <input
                  name="instructor"
                  className="input"
                  placeholder="e.g. Pre"
                />
              </div>
              <div>
                <label className="label">Repeat weekly until (optional)</label>
                <input type="date" name="endDate" className="input" />
                <p className="mt-1 text-xs text-ink/40">
                  Leave blank to schedule only this date. Otherwise, repeats
                  weekly through the date you pick here.
                </p>
              </div>

              <WeekdayPicker />

              <button className="btn-primary w-full">Add to calendar</button>
            </form>
          ) : (
            <p className="text-sm text-ink/50">
              Add at least one class and one studio first on the{" "}
              <a href="/admin/locations" className="text-magenta">
                Studios &amp; classes
              </a>{" "}
              page.
            </p>
          )}
        </div>

        <div className="card p-6">
          <h2 className="mb-4 font-600">Scheduled classes</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-ink/50">Nothing scheduled yet.</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {sessions.map((s) => {
                const booked = s.bookings.filter(
                  (b) => b.status === "booked"
                ).length;

                let remaining = 0;
                if (s.seriesId) {
                  const seen = seenSoFar.get(s.seriesId) ?? 0;
                  remaining = (seriesCounts.get(s.seriesId) ?? 0) - seen;
                  seenSoFar.set(s.seriesId, seen + 1);
                }

                return (
                  <li key={s.id}>
                    <SessionRow
                      session={{
                        id: s.id,
                        startsAt: s.startsAt,
                        endsAt: s.endsAt,
                        capacity: s.capacity,
                        instructor: s.instructor,
                        canceled: s.canceled,
                        seriesId: s.seriesId,
                        locationId: s.locationId,
                      }}
                      className={s.classType.name}
                      locationName={s.location.name}
                      locations={studios.map((l) => ({
                        id: l.id,
                        name: l.name,
                      }))}
                      booked={booked}
                      dayLabel={formatDay(s.startsAt)}
                      timeLabel={formatTime(s.startsAt)}
                      startValue={formatDateTimeLocalValue(s.startsAt)}
                      seriesRemaining={remaining}
                    />
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
