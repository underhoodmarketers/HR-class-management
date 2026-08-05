import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instructorLocations, users } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { formatDay, formatBirthday } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InstructorCustomersPage() {
  const session = await requireInstructor();
  const now = new Date();

  const myLocations = await db.query.instructorLocations.findMany({
    where: eq(instructorLocations.userId, session.userId),
    with: { location: true },
  });
  const myLocationIds = new Set(myLocations.map((l) => l.locationId));
  const myLocationNames = myLocations.map((l) => l.location.name).join(", ");

  const customers = await db.query.users.findMany({
    where: eq(users.role, "customer"),
    with: {
      memberships: { with: { package: { with: { locations: true } } } },
    },
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  // A customer is "yours" if any membership's package includes one of your
  // studios, or the package has no studio restriction (valid everywhere).
  const scoped = customers.filter((c) =>
    c.memberships.some((m) => {
      const pkgLocations = m.package.locations;
      return (
        pkgLocations.length === 0 ||
        pkgLocations.some((pl) => myLocationIds.has(pl.locationId))
      );
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Customers</h1>
        <p className="text-sm text-ink/50">
          {myLocationNames ? `${myLocationNames} · ` : ""}
          {scoped.length} customer{scoped.length === 1 ? "" : "s"}
        </p>
      </div>

      {myLocations.length === 0 ? (
        <div className="card p-6 text-sm text-ink/50">
          You&apos;re not assigned to a studio yet. Ask an admin to assign one.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-blush/50 text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Contact</th>
                <th className="px-5 py-3 font-semibold">Membership</th>
                <th className="px-5 py-3 font-semibold">Expires</th>
                <th className="px-5 py-3 font-semibold">Birthday</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {scoped.map((c) => {
                const activeMemberships = c.memberships.filter(
                  (m) => m.status === "active" && m.endsAt > now
                );
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-ink/60">
                      <div>{c.email}</div>
                      <div className="text-xs text-ink/40">{c.phone || "—"}</div>
                    </td>
                    <td className="px-5 py-3 text-ink/60">
                      {activeMemberships.length > 0 ? (
                        activeMemberships.map((m) => (
                          <div key={m.id}>{m.package.name}</div>
                        ))
                      ) : (
                        <span className="text-ink/40">None</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink/60">
                      {activeMemberships.length > 0 ? (
                        activeMemberships.map((m) => (
                          <div key={m.id}>{formatDay(m.endsAt)}</div>
                        ))
                      ) : (
                        <span className="text-ink/40">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink/60">{formatBirthday(c.dob)}</td>
                  </tr>
                );
              })}
              {scoped.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-ink/40">
                    No customers at your studio yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
