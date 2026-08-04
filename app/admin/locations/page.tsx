import { db } from "@/db";
import { bookings, classSessions, classTypes, locations } from "@/db/schema";
import { count, eq, and, gte, lt, isNull } from "drizzle-orm";
import {
  createLocation,
  createClassType,
} from "@/app/actions/admin";
import StudioRow from "@/components/StudioRow";

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: {
    error?: string;
    saved?: string;
    deleted?: string;
    archived?: string;
    removed?: string;
    past?: string;
    refunded?: string;
  };
}) {
  const now = new Date();
  const [studios, types, futureCounts, pastCounts, futureBookingCounts] =
    await Promise.all([
      db.select().from(locations).where(isNull(locations.archivedAt)),
      db.select().from(classTypes),
      db
        .select({ locationId: classSessions.locationId, total: count() })
        .from(classSessions)
        .where(gte(classSessions.startsAt, now))
        .groupBy(classSessions.locationId),
      db
        .select({ locationId: classSessions.locationId, total: count() })
        .from(classSessions)
        .where(lt(classSessions.startsAt, now))
        .groupBy(classSessions.locationId),
      db
        .select({ locationId: classSessions.locationId, total: count() })
        .from(bookings)
        .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
        .where(
          and(
            gte(classSessions.startsAt, now),
            eq(bookings.status, "booked")
          )
        )
        .groupBy(classSessions.locationId),
    ]);

  const futureByLocation = new Map(
    futureCounts.map((r) => [r.locationId, Number(r.total)])
  );
  const pastByLocation = new Map(
    pastCounts.map((r) => [r.locationId, Number(r.total)])
  );
  const futureBookingsByLocation = new Map(
    futureBookingCounts.map((r) => [r.locationId, Number(r.total)])
  );

  const banner =
    searchParams.error === "name_required"
      ? { tone: "error" as const, text: "A studio needs a name." }
      : searchParams.saved
      ? { tone: "ok" as const, text: "Studio updated." }
      : searchParams.archived
      ? {
          tone: "ok" as const,
          text: `Studio archived. ${searchParams.removed ?? 0} upcoming class${
            searchParams.removed === "1" ? "" : "es"
          } removed and ${searchParams.refunded ?? 0} credit${
            searchParams.refunded === "1" ? "" : "s"
          } refunded. ${searchParams.past ?? 0} past class${
            searchParams.past === "1" ? "" : "es"
          } kept for your records.`,
        }
      : searchParams.deleted
      ? {
          tone: "ok" as const,
          text: `Studio deleted, along with ${
            searchParams.removed ?? 0
          } upcoming class${
            searchParams.removed === "1" ? "" : "es"
          }. ${searchParams.refunded ?? 0} credit${
            searchParams.refunded === "1" ? "" : "s"
          } refunded.`,
        }
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Studios &amp; classes</h1>
        <p className="text-sm text-ink/50">Where you teach and what you teach.</p>
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

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Studios */}
        <div className="space-y-4">
          <div className="card p-6">
            <h2 className="mb-4 font-600">Add a studio</h2>
            <form action={createLocation} className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input name="name" className="input" placeholder="Frisco" required />
              </div>
              <div>
                <label className="label">Address</label>
                <input name="address" className="input" placeholder="Street, City, TX" />
              </div>
              <button className="btn-primary w-full">Add studio</button>
            </form>
          </div>
          <div className="card divide-y divide-ink/5">
            {studios.map((s) => (
              <StudioRow
                key={s.id}
                studio={s}
                futureClasses={futureByLocation.get(s.id) ?? 0}
                pastClasses={pastByLocation.get(s.id) ?? 0}
                futureBookings={futureBookingsByLocation.get(s.id) ?? 0}
              />
            ))}
            {studios.length === 0 ? (
              <p className="p-4 text-sm text-ink/40">No studios yet.</p>
            ) : null}
          </div>
        </div>

        {/* Class types */}
        <div className="space-y-4">
          <div className="card p-6">
            <h2 className="mb-4 font-600">Add a class</h2>
            <form action={createClassType} className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input name="name" className="input" placeholder="Bollywood Zumba" required />
              </div>
              <div>
                <label className="label">Description</label>
                <input name="description" className="input" placeholder="High-energy dance cardio" />
              </div>
              <div>
                <label className="label">Color</label>
                <input type="color" name="color" defaultValue="#C2185B" className="h-10 w-20 rounded-lg border border-ink/10" />
              </div>
              <button className="btn-primary w-full">Add class</button>
            </form>
          </div>
          <div className="card divide-y divide-ink/5">
            {types.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-4">
                <span className="h-8 w-1.5 rounded-full" style={{ background: t.color }} />
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-ink/50">{t.description || "—"}</p>
                </div>
              </div>
            ))}
            {types.length === 0 ? (
              <p className="p-4 text-sm text-ink/40">No classes yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
