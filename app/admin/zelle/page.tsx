import { desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { zellePayments } from "@/db/schema";
import { updateZelleSettings, approveZellePayment, rejectZellePayment } from "@/app/actions/admin";
import { formatDay, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid: "Enter where customers should send Zelle payments.",
};

export default async function ZellePage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const [settings, pending, history] = await Promise.all([
    db.query.zelleSettings.findFirst(),
    db.query.zellePayments.findMany({
      where: eq(zellePayments.status, "pending"),
      with: { user: true, package: true },
      orderBy: [desc(zellePayments.createdAt)],
    }),
    db.query.zellePayments.findMany({
      where: ne(zellePayments.status, "pending"),
      with: { user: true, package: true },
      orderBy: [desc(zellePayments.reviewedAt)],
      limit: 20,
    }),
  ]);

  const banner =
    searchParams.error && errorMessages[searchParams.error]
      ? { tone: "error" as const, text: errorMessages[searchParams.error] }
      : searchParams.saved
      ? { tone: "ok" as const, text: "Zelle info saved." }
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Zelle payments</h1>
        <p className="text-sm text-ink/50">
          Customers can request to pay by Zelle instead of card. Verify against your bank
          activity, then approve to grant their membership.
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
          <h2 className="mb-4 font-600">Where to send payment</h2>
          <form action={updateZelleSettings} className="space-y-4">
            <div>
              <label className="label">Zelle recipient</label>
              <input
                name="recipient"
                defaultValue={settings?.recipient ?? ""}
                placeholder="studio@example.com or (555) 123-4567"
                required
                className="input"
              />
            </div>
            <div>
              <label className="label">
                Extra instructions <span className="font-400 text-ink/40">(optional)</span>
              </label>
              <textarea
                name="instructions"
                defaultValue={settings?.instructions ?? ""}
                placeholder="e.g. Please include your name in the memo."
                rows={3}
                className="input"
              />
            </div>
            <button className="btn-primary w-full">Save</button>
          </form>
          {!settings ? (
            <p className="mt-3 text-xs text-amber-700">
              Not set yet — the Zelle option is hidden from customers until you save this.
            </p>
          ) : null}
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="mb-3 font-600">
              Pending review {pending.length > 0 ? `(${pending.length})` : ""}
            </h2>
            {pending.length === 0 ? (
              <div className="card p-6 text-sm text-ink/40">Nothing to review.</div>
            ) : (
              <ul className="space-y-3">
                {pending.map((z) => (
                  <li key={z.id} className="card flex items-center justify-between p-5">
                    <div>
                      <p className="font-600">{z.user.name}</p>
                      <p className="text-sm text-ink/60">
                        {z.package.name} · {formatMoney(z.amountCents)}
                      </p>
                      <p className="mt-1 text-xs text-ink/40">
                        {z.confirmationNumber
                          ? `Confirmation: ${z.confirmationNumber}`
                          : "No confirmation number given"}{" "}
                        · submitted {formatDay(z.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <form action={rejectZellePayment}>
                        <input type="hidden" name="id" value={z.id} />
                        <button className="rounded-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                          Reject
                        </button>
                      </form>
                      <form action={approveZellePayment}>
                        <input type="hidden" name="id" value={z.id} />
                        <button className="btn-primary px-4 py-1.5 text-xs">Approve</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {history.length > 0 ? (
            <div>
              <h2 className="mb-3 font-600">Recent history</h2>
              <ul className="card divide-y divide-ink/5">
                {history.map((z) => (
                  <li key={z.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <span className="font-medium">{z.user.name}</span>
                      <span className="text-ink/50"> · {z.package.name} · {formatMoney(z.amountCents)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={
                          z.status === "approved"
                            ? "badge bg-emerald-100 text-emerald-700"
                            : "badge bg-ink/10 text-ink/50"
                        }
                      >
                        {z.status}
                      </span>
                      {z.status === "rejected" ? (
                        <form action={approveZellePayment}>
                          <input type="hidden" name="id" value={z.id} />
                          <button className="rounded-full px-3 py-1 text-xs font-semibold text-magenta hover:bg-blush">
                            Approve anyway
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
