import { eq } from "drizzle-orm";
import { db } from "@/db";
import { locations, packages, users } from "@/db/schema";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { togglePromoCode } from "@/app/actions/admin";
import { formatMoney } from "@/lib/utils";
import PromoCodeForm from "@/components/PromoCodeForm";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid: "Fill in a code and a valid discount.",
  duplicate: "That code is already in use. Try a different one.",
  stripe_not_configured: "Payments aren't set up yet. Please contact support.",
};

function discountLabel(coupon: {
  percent_off: number | null;
  amount_off: number | null;
  duration: string;
  duration_in_months: number | null;
}) {
  const amount =
    coupon.percent_off != null
      ? `${coupon.percent_off}% off`
      : coupon.amount_off != null
      ? `${formatMoney(coupon.amount_off)} off`
      : "Discount";
  const duration =
    coupon.duration === "forever"
      ? "every renewal"
      : coupon.duration === "repeating"
      ? `${coupon.duration_in_months} month${coupon.duration_in_months === 1 ? "" : "s"}`
      : "first payment";
  return `${amount} · ${duration}`;
}

export default async function PromoCodesPage({
  searchParams,
}: {
  searchParams: { created?: string; error?: string };
}) {
  const banner =
    searchParams.error && errorMessages[searchParams.error]
      ? { tone: "error" as const, text: errorMessages[searchParams.error] }
      : searchParams.created
      ? { tone: "ok" as const, text: "Promo code created." }
      : null;

  const [codes, allPackages, allLocations, allCustomers, ourPromoCodes] = await Promise.all([
    stripeConfigured()
      ? stripe.promotionCodes
          .list({ limit: 100, expand: ["data.coupon"] })
          .then((r) => r.data)
      : Promise.resolve([]),
    db.select().from(packages),
    db.select().from(locations),
    db.query.users.findMany({
      where: eq(users.role, "customer"),
      columns: { id: true, name: true, email: true },
      orderBy: (u, { asc }) => [asc(u.name)],
    }),
    db.query.promoCodes.findMany({
      with: {
        packages: { with: { package: true } },
        customers: { with: { user: true } },
        locations: { with: { location: true } },
      },
    }),
  ]);

  const restrictionsByPromotionCodeId = new Map(
    ourPromoCodes.map((p) => [
      p.stripePromotionCodeId,
      {
        packages: p.packages.map((x) => x.package.name),
        locations: p.locations.map((x) => x.location.name),
        customers: p.customers.map((x) => x.user.name),
      },
    ])
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-600">Promo codes</h1>
        <p className="text-sm text-ink/50">
          Discount codes customers can enter at checkout. Managed through Stripe.
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

      {!stripeConfigured() ? (
        <div className="card p-6 text-sm text-ink/50">
          Payments aren&apos;t set up yet. Add Stripe keys to manage promo codes.
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <div className="card h-fit p-6">
            <h2 className="mb-4 font-600">New promo code</h2>
            <PromoCodeForm
              packages={allPackages.map((p) => ({ id: p.id, name: p.name }))}
              locations={allLocations.map((l) => ({ id: l.id, name: l.name }))}
              customers={allCustomers}
            />
          </div>

          <div className="space-y-3">
            {codes.length === 0 ? (
              <div className="card p-6 text-sm text-ink/40">No promo codes yet.</div>
            ) : (
              codes.map((c) => {
                const coupon = typeof c.coupon === "object" ? c.coupon : null;
                const restrictions = restrictionsByPromotionCodeId.get(c.id);
                const restrictionParts = [
                  restrictions?.packages.length ? `Packages: ${restrictions.packages.join(", ")}` : null,
                  restrictions?.locations.length ? `Studios: ${restrictions.locations.join(", ")}` : null,
                  restrictions?.customers.length ? `Customers: ${restrictions.customers.join(", ")}` : null,
                ].filter(Boolean);
                return (
                  <div key={c.id} className="card flex items-center justify-between p-5">
                    <div>
                      <p className="font-600">
                        {c.code}
                        {!c.active ? (
                          <span className="badge ml-2 bg-ink/10 text-ink/50">Inactive</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-ink/50">
                        {coupon ? discountLabel(coupon) : "Discount"}
                      </p>
                      <p className="mt-1 text-xs text-ink/40">
                        {c.times_redeemed} used
                        {c.max_redemptions ? ` / ${c.max_redemptions} max` : ""}
                        {c.expires_at
                          ? ` · expires ${new Date(c.expires_at * 1000).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}`
                          : ""}
                      </p>
                      {restrictionParts.length > 0 ? (
                        <p className="mt-1 text-xs text-magenta-deep">{restrictionParts.join(" · ")}</p>
                      ) : null}
                    </div>
                    <form action={togglePromoCode}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={String(c.active)} />
                      <button className="btn-ghost px-4 py-2 text-xs">
                        {c.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
