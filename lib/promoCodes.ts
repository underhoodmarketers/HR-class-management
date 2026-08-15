import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { promoCodes, promoCodeRedemptions } from "@/db/schema";
import { stripe } from "./stripe";
import { formatMoney } from "./utils";

/**
 * Validates a promo code against restrictions Stripe has no concept of
 * (package/customer/location/per-customer-use-count are all app-specific).
 * The actual coupon terms and total redemption pool still live in Stripe —
 * checkout applies the discount via the promotion code id (not the raw
 * coupon id) so Stripe enforces its own active/expiry/max-redemptions rules
 * natively.
 */
export async function resolvePromoCode(
  rawCode: string,
  ctx: { userId: number; packageId: number; locationIds: number[] }
): Promise<
  | { ok: true; promoCodeId: number; stripePromotionCodeId: string; label: string }
  | { ok: false; error: string }
> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a promo code." };

  const promo = await db.query.promoCodes.findFirst({
    where: eq(promoCodes.code, code),
    with: { packages: true, customers: true, locations: true },
  });
  if (!promo) return { ok: false, error: "That code isn't valid." };

  if (promo.packages.length > 0 && !promo.packages.some((p) => p.packageId === ctx.packageId)) {
    return { ok: false, error: "That code isn't valid for this package." };
  }
  if (promo.customers.length > 0 && !promo.customers.some((c) => c.userId === ctx.userId)) {
    return { ok: false, error: "That code isn't valid for your account." };
  }
  if (
    promo.locations.length > 0 &&
    !promo.locations.some((l) => ctx.locationIds.includes(l.locationId))
  ) {
    return { ok: false, error: "That code isn't valid for your studio." };
  }

  if (promo.maxUsesPerCustomer !== null) {
    const [{ value: usedCount }] = await db
      .select({ value: count() })
      .from(promoCodeRedemptions)
      .where(
        and(eq(promoCodeRedemptions.promoCodeId, promo.id), eq(promoCodeRedemptions.userId, ctx.userId))
      );
    if (usedCount >= promo.maxUsesPerCustomer) {
      return { ok: false, error: "You've already used this code the maximum number of times." };
    }
  }

  let promotionCode;
  try {
    promotionCode = await stripe.promotionCodes.retrieve(promo.stripePromotionCodeId);
  } catch {
    return { ok: false, error: "That code isn't valid." };
  }
  if (!promotionCode.active) return { ok: false, error: "That code has expired or is no longer active." };
  if (promotionCode.max_redemptions != null && promotionCode.times_redeemed >= promotionCode.max_redemptions) {
    return { ok: false, error: "That code has already been fully redeemed." };
  }

  const coupon = promotionCode.coupon;
  const label =
    coupon.percent_off != null
      ? `${coupon.percent_off}% off`
      : coupon.amount_off != null
      ? `${formatMoney(coupon.amount_off)} off`
      : "Discount applied";

  return { ok: true, promoCodeId: promo.id, stripePromotionCodeId: promo.stripePromotionCodeId, label };
}
