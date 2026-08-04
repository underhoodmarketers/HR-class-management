"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packages } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { stripe, stripeConfigured } from "@/lib/stripe";

export type BillingType = "one_time" | "recurring";

/**
 * Creates a Stripe Checkout Session in embedded mode and returns its
 * client secret, so the payment form can render inline on our own page
 * instead of redirecting to checkout.stripe.com.
 */
export async function createEmbeddedCheckout(
  packageId: number,
  billingType: BillingType
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
          ],
          subscription_data: { metadata },
          metadata,
          allow_promotion_codes: true,
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
          ],
          metadata,
          allow_promotion_codes: true,
          redirect_on_completion: "if_required",
          return_url: `${baseUrl}/portal?purchase=success`,
        }
  );

  if (!checkout.client_secret) return { error: "Something went wrong starting checkout." };
  return { clientSecret: checkout.client_secret };
}
