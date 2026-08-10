import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instructorLocations, users } from "@/db/schema";
import { requireInstructor } from "@/lib/guards";
import { sendInstructorCustomerEmail } from "@/app/actions/instructor";
import EmailCustomerButton from "@/components/EmailCustomerButton";
import { formatDay, formatBirthday } from "@/lib/utils";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  email_invalid: "Fill in a subject and a message.",
};

export default async function InstructorCustomersPage({
  searchParams,
}: {
  searchParams: { email_sent?: string; error?: string };
}) {
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
      memberships: { with: { package: true } },
    },
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  // A customer is "yours" if their preferred studio is one you're assigned to.
  const scoped = customers.filter((c) => c.locationId !== null && myLocationIds.has(c.locationId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Customers</h1>
        <p className="text-sm text-ink/50">
          {myLocationNames ? `${myLocationNames} · ` : ""}
          {scoped.length} customer{scoped.length === 1 ? "" : "s"}
        </p>
      </div>

      {searchParams.email_sent ? (
        <div className="rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep">
          Email sent.
        </div>
      ) : searchParams.error && errorMessages[searchParams.error] ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessages[searchParams.error]}
        </div>
      ) : null}

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
                <th className="px-5 py-3 font-semibold"></th>
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
                    <td className="px-5 py-3 text-right">
                      <EmailCustomerButton
                        customerId={c.id}
                        customerName={c.name}
                        action={sendInstructorCustomerEmail}
                      />
                    </td>
                  </tr>
                );
              })}
              {scoped.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-ink/40">
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
