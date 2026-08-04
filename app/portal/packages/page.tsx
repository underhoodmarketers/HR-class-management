import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packages } from "@/db/schema";
import { startCheckout } from "@/app/actions/checkout";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  stripe_not_configured: "Payments aren't set up yet. Please contact the studio.",
  canceled: "Checkout canceled — no charge was made.",
  unavailable: "That package is no longer available.",
  checkout_failed: "Something went wrong starting checkout. Try again.",
};

export default async function PortalPackages({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const pkgs = await db.query.packages.findMany({
    where: eq(packages.active, true),
    with: { locations: { with: { location: true } } },
    orderBy: (p, { asc }) => [asc(p.priceCents)],
  });

  const error = searchParams.error ? errorMessages[searchParams.error] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Packages</h1>
        <p className="text-sm text-ink/50">Pick a plan and pay securely by card.</p>
      </div>

      {error ? (
        <div className="rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800">{error}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {pkgs.map((p) => (
          <div key={p.id} className="card flex flex-col p-6">
            <p className="font-display text-xl font-600">{p.name}</p>
            <p className="mt-1 text-sm text-ink/50">{p.description}</p>
            <p className="mt-4 font-display text-3xl font-700 text-magenta">
              {formatMoney(p.priceCents)}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-ink/60">
              <li>{p.credits ? `${p.credits} classes` : "Unlimited classes"}</li>
              <li>Valid for {p.durationDays} days</li>
              <li>
                {p.locations.length
                  ? p.locations.map((pl) => pl.location.name).join(", ")
                  : "All studios"}
              </li>
            </ul>
            <form action={startCheckout} className="mt-6">
              <input type="hidden" name="packageId" value={p.id} />
              <button className="btn-primary w-full">Buy now</button>
            </form>
          </div>
        ))}
        {pkgs.length === 0 ? (
          <p className="text-sm text-ink/40">No packages available right now.</p>
        ) : null}
      </div>
    </div>
  );
}
