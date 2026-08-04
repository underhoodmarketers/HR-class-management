import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { memberships, packages } from "@/db/schema";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const checkout = event.data.object as Stripe.Checkout.Session;
    const userId = Number(checkout.metadata?.userId);
    const packageId = Number(checkout.metadata?.packageId);

    if (userId && packageId) {
      // Idempotency: skip if we've already recorded this checkout.
      const already = await db.query.memberships.findFirst({
        where: eq(memberships.stripeSessionId, checkout.id),
      });

      if (!already) {
        const pkg = await db.query.packages.findFirst({
          where: eq(packages.id, packageId),
        });
        if (pkg) {
          const startsAt = new Date();
          const endsAt = new Date(
            startsAt.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000
          );
          await db.insert(memberships).values({
            userId,
            packageId,
            status: "active",
            creditsRemaining: pkg.credits, // null = unlimited
            startsAt,
            endsAt,
            stripeSessionId: checkout.id,
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
