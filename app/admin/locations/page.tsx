import { db } from "@/db";
import { classTypes, locations } from "@/db/schema";
import {
  createLocation,
  toggleLocation,
  createClassType,
} from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [studios, types] = await Promise.all([
    db.select().from(locations),
    db.select().from(classTypes),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Studios &amp; classes</h1>
        <p className="text-sm text-ink/50">Where you teach and what you teach.</p>
      </div>

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
              <div key={s.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-ink/50">{s.address || "—"}</p>
                </div>
                <form action={toggleLocation}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-ghost px-3 py-1.5 text-xs">
                    {s.active ? "Active" : "Inactive"}
                  </button>
                </form>
              </div>
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
