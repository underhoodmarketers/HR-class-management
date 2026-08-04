import { db } from "@/db";
import { updateWaiver } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function WaiverPage() {
  const waiver = await db.query.waiverTemplate.findFirst();

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Liability waiver</h1>
        <p className="text-sm text-ink/50">
          New members sign this during signup. Saving creates a new version; existing
          signatures keep the version they signed.
        </p>
      </div>

      <form action={updateWaiver} className="card space-y-4 p-6">
        <div>
          <label className="label">Title</label>
          <input
            name="title"
            defaultValue={waiver?.title ?? "Holistic Rhythm Liability Waiver"}
            className="input"
            required
          />
        </div>
        <div>
          <label className="label">Waiver text</label>
          <textarea
            name="body"
            rows={16}
            defaultValue={waiver?.body ?? ""}
            className="input font-mono text-xs leading-relaxed"
            required
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink/40">
            {waiver ? `Current version: v${waiver.version}` : "No waiver saved yet"}
          </span>
          <button className="btn-primary">Save waiver</button>
        </div>
      </form>
    </div>
  );
}
