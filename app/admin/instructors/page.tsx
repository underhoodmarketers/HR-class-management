import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations, users } from "@/db/schema";
import { createInstructor, deleteInstructor } from "@/app/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid: "Fill in name, email, an 8+ character password, and at least one studio.",
  exists: "An account with that email already exists.",
};

export default async function InstructorsPage({
  searchParams,
}: {
  searchParams: { created?: string; deleted?: string; error?: string };
}) {
  const [studios, instructors] = await Promise.all([
    db.select().from(locations).where(isNull(locations.archivedAt)),
    db.query.users.findMany({
      where: eq(users.role, "instructor"),
      orderBy: (u, { desc }) => [desc(u.createdAt)],
      with: { instructorLocations: { with: { location: true } } },
    }),
  ]);

  const banner =
    searchParams.error && errorMessages[searchParams.error]
      ? { tone: "error" as const, text: errorMessages[searchParams.error] }
      : searchParams.created
      ? { tone: "ok" as const, text: "Instructor created." }
      : searchParams.deleted
      ? { tone: "ok" as const, text: "Instructor deleted." }
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Instructors</h1>
        <p className="text-sm text-ink/50">
          Staff accounts that can see customers and class rosters for their assigned studio(s).
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
          <h2 className="mb-4 font-600">New instructor</h2>
          {studios.length === 0 ? (
            <p className="text-sm text-ink/50">
              Add a studio first on the Studios &amp; classes page.
            </p>
          ) : (
            <form action={createInstructor} className="space-y-4">
              <div>
                <label className="label">Full name</label>
                <input name="name" required className="input" />
              </div>
              <div>
                <label className="label">Email</label>
                <input name="email" type="email" required className="input" />
              </div>
              <div>
                <label className="label">
                  Phone <span className="font-400 text-ink/40">(optional)</span>
                </label>
                <input name="phone" type="tel" className="input" />
              </div>
              <div>
                <label className="label">Temporary password</label>
                <input name="password" type="text" required minLength={8} className="input" />
                <p className="mt-1 text-xs text-ink/40">
                  Share this with the instructor — they can change it later.
                </p>
              </div>
              <div>
                <label className="label">Studios</label>
                <div className="space-y-1.5 rounded-xl border border-ink/10 p-3">
                  {studios.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="locationIds" value={s.id} className="h-4 w-4 accent-magenta" />
                      {s.name}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink/40">
                  They&apos;ll only see customers and classes at the studios checked here.
                </p>
              </div>
              <button className="btn-primary w-full">Create instructor</button>
            </form>
          )}
        </div>

        <div className="space-y-3">
          {instructors.length === 0 ? (
            <div className="card p-6 text-sm text-ink/40">No instructors yet.</div>
          ) : (
            instructors.map((i) => (
              <div key={i.id} className="card flex items-center justify-between p-5">
                <div>
                  <p className="font-600">{i.name}</p>
                  <p className="text-sm text-ink/50">
                    {i.email}
                    {i.phone ? ` · ${i.phone}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-ink/40">
                    {i.instructorLocations.length
                      ? i.instructorLocations.map((il) => il.location.name).join(", ")
                      : "No studios assigned"}
                  </p>
                </div>
                <ConfirmDeleteButton
                  id={i.id}
                  action={deleteInstructor}
                  confirmText={`Delete ${i.name}?\n\nThis removes their instructor account. This can't be undone.`}
                  className="rounded-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
