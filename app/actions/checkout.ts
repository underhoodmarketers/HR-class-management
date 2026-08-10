"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packages, users } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { stripeFeeCents } from "@/lib/utils";
import { resolvePromoCode } from "@/lib/promoCodes";

export type BillingType = "one_time" | "recurring";

export async function validatePromoCode(
  code: string,
  packageId: number
): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  const session = await requireUser();
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user) return { ok: false, error: "That code isn't valid." };

  const result = await resolvePromoCode(code, {
    userId: user.id,
    packageId,
    locationId: user.locationId,
  });
  if (!result.ok) return result;
  return { ok: true, label: result.label };
}

/**
 * Creates a Stripe Checkout Session in embedded mode and returns its
 * client secret, so the payment form can render inline on our own page
 * instead of redirecting to checkout.stripe.com.
 */
export async function createEmbeddedCheckout(
  packageId: number,
  billingType: BillingType,
  promoCode?: string
): Promise<{ clientSecret: string } | { error: string }> {
  const session = await requireUser();

  const pkg = await db.query.packages.findFirst({
    where: eq(packages.id, packageId),
  });
  if (!pkg || !pkg.active) return { error: "That package is no longer available." };

  if (billingType === "recurring" && (!pkg.recurringPriceCents || !pkg.billingWeeks)) {
    return { error: "Autopay isn't available for that package." };
  }

  if (!stripeConfigured()) {
    return { error: "Payments aren't set up yet. Please contact the studio." };
  }

  let discounts: { promotion_code: string }[] | undefined;
  if (promoCode) {
    const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
    const result = await resolvePromoCode(promoCode, {
      userId: session.userId,
      packageId,
      locationId: user?.locationId ?? null,
    });
    if (!result.ok) return { error: result.error };
    discounts = [{ promotion_code: result.stripePromotionCodeId }];
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const metadata = {
    userId: String(session.userId),
    packageId: String(pkg.id),
    billingType,
  };

  const checkout = await stripe.checkout.sessions.create(
    billingType === "recurring"
      ? {
          ui_mode: "embedded",
          mode: "subscription",
          customer_email: session.email,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: pkg.recurringPriceCents!,
                recurring: { interval: "week", interval_count: pkg.billingWeeks! },
                product_data: {
                  name: `${pkg.name} (autopay)`,
                  description: pkg.description || undefined,
                },
              },
            },
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: stripeFeeCents(pkg.recurringPriceCents!),
                recurring: { interval: "week", interval_count: pkg.billingWeeks! },
                product_data: { name: "Card processing fee" },
              },
            },
          ],
          subscription_data: { metadata },
          metadata,
          ...(discounts ? { discounts } : {}),
          redirect_on_completion: "if_required",
          return_url: `${baseUrl}/portal?purchase=success`,
        }
      : {
          ui_mode: "embedded",
          mode: "payment",
          customer_email: session.email,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: pkg.priceCents,
                product_data: {
                  name: pkg.name,
                  description: pkg.description || undefined,
                },
              },
            },
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: stripeFeeCents(pkg.priceCents),
                product_data: { name: "Card processing fee" },
              },
            },
          ],
          metadata,
          ...(discounts ? { discounts } : {}),
          redirect_on_completion: "if_required",
          return_url: `${baseUrl}/portal?purchase=success`,
        }
  );

  if (!checkout.client_secret) return { error: "Something went wrong starting checkout." };
  return { clientSecret: checkout.client_secret };
}
