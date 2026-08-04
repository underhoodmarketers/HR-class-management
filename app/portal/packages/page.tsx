import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packages } from "@/db/schema";
import { formatMoney } from "@/lib/utils";
import PackageTierCard from "@/components/PackageTierCard";
import BuyButton from "@/components/BuyButton";

export const dynamic = "force-dynamic";

export default async function PortalPackages() {
  const pkgs = await db.query.packages.findMany({
    where: eq(packages.active, true),
    with: { locations: { with: { location: true } } },
    orderBy: (p, { asc }) => [asc(p.priceCents)],
  });

  // Packages named "Tier — Duration" (e.g. "Starter — 3 Months") are grouped
  // into one card per tier with a duration switcher. Anything else (like the
  // Drop-In pack) is shown as its own standalone card.
  const tierGroups = new Map<string, typeof pkgs>();
  const standalone: typeof pkgs = [];
  for (const p of pkgs) {
    const [tier, duration] = p.name.split(" — ");
    if (duration) {
      if (!tierGroups.has(tier)) tierGroups.set(tier, []);
      tierGroups.get(tier)!.push(p);
    } else {
      standalone.push(p);
    }
  }
  for (const variants of tierGroups.values()) {
    variants.sort((a, b) => a.durationDays - b.durationDays);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-600">Packages</h1>
        <p className="text-sm text-ink/50">Pick a plan and pay securely by card.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...tierGroups.entries()].map(([tier, variants]) => (
          <PackageTierCard
            key={tier}
            tierName={tier}
            perWeekLabel={variants[0].description || ""}
            variants={variants.map((p) => ({
              id: p.id,
              durationLabel: p.name.split(" — ")[1],
              credits: p.credits,
              priceCents: p.priceCents,
              recurringPriceCents: p.recurringPriceCents,
              billingWeeks: p.billingWeeks,
              locationNames: p.locations.map((pl) => pl.location.name),
            }))}
          />
        ))}

        {standalone.map((p) => (
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
            <BuyButton
              packageId={p.id}
              billingType="one_time"
              label="Buy now"
              className="btn-primary mt-6 w-full"
            />
          </div>
        ))}

        {pkgs.length === 0 ? (
          <p className="text-sm text-ink/40">No packages available right now.</p>
        ) : null}
      </div>
    </div>
  );
}
