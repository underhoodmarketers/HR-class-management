"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packages } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { stripe, stripeConfigured } from "@/lib/stripe";

export async function startCheckout(formData: FormData) {
  const session = await requireUser();
  const packageId = Number(formData.get("packageId"));
  const billingType = formData.get("billingType") === "recurring" ? "recurring" : "one_time";

  const pkg = await db.query.packages.findFirst({
    where: eq(packages.id, packageId),
  });
  if (!pkg || !pkg.active) redirect("/portal/packages?error=unavailable");

  if (billingType === "recurring" && (!pkg.recurringPriceCents || !pkg.billingWeeks)) {
    redirect("/portal/packages?error=unavailable");
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (!stripeConfigured()) {
    // Allows local testing before Stripe keys are added.
    redirect("/portal/packages?error=stripe_not_configured");
  }

  const metadata = {
    userId: String(session.userId),
    packageId: String(pkg.id),
    billingType,
  };

  const checkout = await stripe.checkout.sessions.create(
    billingType === "recurring"
      ? {
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
          success_url: `${baseUrl}/portal?purchase=success`,
          cancel_url: `${baseUrl}/portal/packages?error=canceled`,
        }
      : {
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
          success_url: `${baseUrl}/portal?purchase=success`,
          cancel_url: `${baseUrl}/portal/packages?error=canceled`,
        }
  );

  if (!checkout.url) redirect("/portal/packages?error=checkout_failed");
  redirect(checkout.url);
}
