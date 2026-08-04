import { isNull } from "drizzle-orm";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { createPackage, togglePackage } from "@/app/actions/admin";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const [studios, pkgs] = await Promise.all([
    db.select().from(locations).where(isNull(locations.archivedAt)),
    db.query.packages.findMany({
      with: { locations: { with: { location: true } } },
      orderBy: (p, { desc }) => [desc(p.active), p.priceCents],
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Packages</h1>
        <p className="text-sm text-ink/50">
          Memberships and class packs customers can buy. Payment runs through Stripe Checkout.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <div className="card h-fit p-6">
          <h2 className="mb-4 font-600">New package</h2>
          <form action={createPackage} className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input name="name" className="input" placeholder="Unlimited Monthly" required />
            </div>
            <div>
              <label className="label">Description</label>
              <input name="description" className="input" placeholder="Dance as much as you like" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Price (USD)</label>
                <input type="number" name="price" step="0.01" min="0" className="input" placeholder="99" required />
              </div>
              <div>
                <label className="label">Duration (days)</label>
                <input type="number" name="durationDays" defaultValue={30} min={1} className="input" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="unlimited" className="h-4 w-4 accent-magenta" />
              Unlimited classes for the duration
            </label>
            <div>
              <label className="label">Or number of class credits</label>
              <input type="number" name="credits" min={1} className="input" placeholder="e.g. 10" />
            </div>
            <div>
              <label className="label">Studios included</label>
              <div className="space-y-1.5 rounded-xl border border-ink/10 p-3">
                {studios.length === 0 ? (
                  <p className="text-xs text-ink/40">Add studios first.</p>
                ) : (
                  studios.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="locationIds" value={s.id} className="h-4 w-4 accent-magenta" />
                      {s.name}
                    </label>
                  ))
                )}
              </div>
              <p className="mt-1 text-xs text-ink/40">Leave all unchecked to include every studio.</p>
            </div>
            <button className="btn-primary w-full">Create package</button>
          </form>
        </div>

        <div className="space-y-3">
          {pkgs.length === 0 ? (
            <div className="card p-6 text-sm text-ink/40">No packages yet.</div>
          ) : (
            pkgs.map((p) => (
              <div key={p.id} className="card flex items-center justify-between p-5">
                <div>
                  <p className="font-600">
                    {p.name}
                    {!p.active ? <span className="badge ml-2 bg-ink/10 text-ink/50">Hidden</span> : null}
                  </p>
                  <p className="text-sm text-ink/50">
                    {formatMoney(p.priceCents)} · {p.credits ? `${p.credits} classes` : "Unlimited"} · {p.durationDays} days
                  </p>
                  <p className="mt-1 text-xs text-ink/40">
                    {p.locations.length
                      ? p.locations.map((pl) => pl.location.name).join(", ")
                      : "All studios"}
                  </p>
                </div>
                <form action={togglePackage}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn-ghost px-4 py-2 text-xs">
                    {p.active ? "Hide" : "Show"}
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
