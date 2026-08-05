import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { packages, zellePayments } from "@/db/schema";
import { formatMoney, daysUntil, stripeFeeCents } from "@/lib/utils";
import { requireUser } from "@/lib/guards";
import { getActiveMemberships } from "@/lib/queries";
import PackageTierCard from "@/components/PackageTierCard";
import BuyButton from "@/components/BuyButton";
import ZelleButton from "@/components/ZelleButton";

export const dynamic = "force-dynamic";

export default async function PortalPackages({
  searchParams,
}: {
  searchParams: { package?: string; billing?: string; zelleRequested?: string };
}) {
  const session = await requireUser();
  const highlightId = Number(searchParams.package) || null;
  const autoOpenBillingType =
    searchParams.billing === "recurring" || searchParams.billing === "one_time"
      ? searchParams.billing
      : null;

  const [pkgs, activeMemberships, zelleSettingsRow, myZellePayments] = await Promise.all([
    db.query.packages.findMany({
      where: eq(packages.active, true),
      with: { locations: { with: { location: true } } },
      orderBy: (p, { asc }) => [asc(p.priceCents)],
    }),
    getActiveMemberships(session.userId),
    db.query.zelleSettings.findFirst(),
    db.query.zellePayments.findMany({
      where: eq(zellePayments.userId, session.userId),
      with: { package: true },
      orderBy: [desc(zellePayments.createdAt)],
      limit: 5,
    }),
  ]);
  const pendingZellePayments = myZellePayments.filter((z) => z.status === "pending");

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

      {searchParams.zelleRequested ? (
        <div className="rounded-2xl border border-magenta/20 bg-blush/40 p-4 text-sm text-magenta-deep">
          Thanks — we&apos;ll verify your Zelle payment and activate your membership shortly.
        </div>
      ) : null}

      {pendingZellePayments.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Pending Zelle {pendingZellePayments.length === 1 ? "payment" : "payments"}
          </p>
          <ul className="space-y-1 text-sm text-amber-800">
            {pendingZellePayments.map((z) => (
              <li key={z.id}>
                {z.package.name} · {formatMoney(z.amountCents)} · awaiting verification
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activeMemberships.length > 0 ? (
        <div className="rounded-2xl border border-magenta/15 bg-blush/40 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">
            You currently have
          </p>
          <ul className="space-y-2">
            {activeMemberships.map((m) => {
              const days = daysUntil(m.endsAt);
              const verb = m.billingType === "recurring" ? "Renews" : "Expires";
              const when =
                days <= 0 ? `${verb} today` : days === 1 ? `${verb} in 1 day` : `${verb} in ${days} days`;
              return (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <span className="font-600 text-magenta-deep">{m.package.name}</span>
                  <span className="text-sm text-ink/60">
                    {m.creditsRemaining === null ? "Unlimited classes" : `${m.creditsRemaining} classes left`}
                    {" · "}
                    {when}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...tierGroups.entries()].map(([tier, variants]) => (
          <PackageTierCard
            key={tier}
            tierName={tier}
            perWeekLabel={variants[0].description || ""}
            highlighted={variants.some((p) => p.id === highlightId)}
            initialVariantId={highlightId ?? undefined}
            autoOpenBillingType={autoOpenBillingType}
            zelleRecipient={zelleSettingsRow?.recipient ?? null}
            zelleInstructions={zelleSettingsRow?.instructions ?? null}
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
          <div
            key={p.id}
            className={`card flex flex-col p-6 ${
              p.id === highlightId ? "ring-2 ring-magenta" : ""
            }`}
          >
            <p className="font-display text-xl font-600">{p.name}</p>
            <p className="mt-1 text-sm text-ink/50">{p.description}</p>
            <p className="mt-4 font-display text-3xl font-700 text-magenta">
              {formatMoney(p.priceCents)}
            </p>
            <p className="text-xs text-ink/40">
              + {formatMoney(stripeFeeCents(p.priceCents))} card processing fee
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
            <div className="mt-6 flex flex-col gap-2">
              <BuyButton
                packageId={p.id}
                billingType="one_time"
                label="Buy now"
                className="btn-primary w-full"
                autoOpen={p.id === highlightId && autoOpenBillingType === "one_time"}
              />
              <ZelleButton
                packageId={p.id}
                priceCents={p.priceCents}
                recipient={zelleSettingsRow?.recipient ?? null}
                instructions={zelleSettingsRow?.instructions ?? null}
                className="btn-subtle w-full"
              />
              {zelleSettingsRow?.recipient ? (
                <p className="text-center text-xs text-ink/40">No processing fee via Zelle</p>
              ) : null}
            </div>
          </div>
        ))}

        {pkgs.length === 0 ? (
          <p className="text-sm text-ink/40">No packages available right now.</p>
        ) : null}
      </div>
    </div>
  );
}
