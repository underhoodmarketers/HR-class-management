import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { memberships, packages, promoCodeRedemptions, users, dropInInvites } from "@/db/schema";
import { stripe } from "@/lib/stripe";
import { rolloverUnusedCredits, applyOwedCredits } from "@/lib/queries";
import { sendPackagePurchaseEmail, sendDropInInviteEmail } from "@/lib/email";

export const runtime = "nodejs";

async function notifyPurchase(userId: number, pkg: { name: string; credits: number | null; priceCents: number }) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  await sendPackagePurchaseEmail(user.email, {
    name: user.name,
    packageName: pkg.name,
    credits: pkg.credits,
    priceCents: pkg.priceCents,
    portalUrl: `${baseUrl}/portal`,
  });
}

type FriendInvite = { name: string; phone: string; email: string };

/**
 * Creates a pending invite for each friend a Drop-In credit was bought for,
 * and emails them a link to it. A friend's own account (and their share of
 * the credits) isn't created until they complete that invite — they need
 * their own login to book, separate from the buyer's.
 */
async function inviteDropInFriends(
  inviterUserId: number,
  packageId: number,
  friends: FriendInvite[]
) {
  if (friends.length === 0) return;
  const [inviter, baseUrl] = [
    await db.query.users.findFirst({ where: eq(users.id, inviterUserId), columns: { name: true } }),
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
  ];
  const inviterName = inviter?.name ?? "A friend";

  for (const friend of friends) {
    const token = crypto.randomBytes(24).toString("hex");
    await db.insert(dropInInvites).values({
      token,
      inviterUserId,
      packageId,
      friendName: friend.name,
      friendPhone: friend.phone,
      friendEmail: friend.email,
    });
    try {
      await sendDropInInviteEmail(friend.email, {
        friendName: friend.name,
        inviterName,
        inviteUrl: `${baseUrl}/invite/${token}`,
      });
    } catch (err) {
      console.error(`Failed to send Drop-In invite email to ${friend.email}:`, err);
    }
  }
}

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
    const billingType = checkout.metadata?.billingType === "recurring" ? "recurring" : "one_time";

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
          // durationDays counts the start day itself as day 1 (e.g. a
          // 28-day/"1 month" package starting 8/8 ends 9/4, not 9/5).
          const endsAt = new Date(
            startsAt.getTime() + (pkg.durationDays - 1) * 24 * 60 * 60 * 1000
          );

          // A Drop-In bought in quantity > 1 can be split with friends —
          // each friend gets their own invite (and, once accepted, their
          // own account + 1 credit) instead of a share landing directly on
          // the buyer's membership.
          const quantity = Math.max(Number(checkout.metadata?.quantity) || 1, 1);
          let friends: FriendInvite[] = [];
          try {
            friends = checkout.metadata?.friends ? JSON.parse(checkout.metadata.friends) : [];
          } catch {
            friends = [];
          }
          const grossCredits = pkg.credits === null ? null : pkg.credits * quantity;
          const friendCount = grossCredits === null ? 0 : Math.min(friends.length, Math.max(grossCredits - 1, 0));
          const buyerCredits = grossCredits === null ? null : grossCredits - friendCount;

          await rolloverUnusedCredits(userId);

          let membershipId: number | null = null;
          if (buyerCredits === null || buyerCredits > 0) {
            const creditsRemaining = await applyOwedCredits(userId, buyerCredits); // null = unlimited
            const [membership] = await db
              .insert(memberships)
              .values({
                userId,
                packageId,
                status: "active",
                creditsRemaining,
                startsAt,
                endsAt,
                stripeSessionId: checkout.id,
                stripeSubscriptionId:
                  typeof checkout.subscription === "string" ? checkout.subscription : null,
                billingType,
              })
              .returning();
            membershipId = membership.id;
          }

          // Only the initial checkout counts as a redemption — autopay
          // renewals reapply the same discount automatically, not a new use.
          const promoCodeId = Number(checkout.metadata?.promoCodeId);
          if (promoCodeId && membershipId) {
            await db.insert(promoCodeRedemptions).values({
              promoCodeId,
              userId,
              membershipId,
            });
          }

          await inviteDropInFriends(userId, packageId, friends.slice(0, friendCount));

          await notifyPurchase(userId, {
            name: pkg.name,
            credits: grossCredits,
            priceCents: pkg.priceCents * quantity,
          });
        }
      }
    }
  }

  // Subscription renewals: the first invoice for a new subscription is
  // covered by checkout.session.completed above, so only act on later
  // billing cycles here to avoid granting the first period twice.
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    if (invoice.billing_reason === "subscription_cycle" && invoice.subscription) {
      const subscriptionId =
        typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id;

      // Idempotency: skip if we've already recorded this invoice.
      const already = await db.query.memberships.findFirst({
        where: eq(memberships.stripeSessionId, invoice.id),
      });

      if (!already) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = Number(subscription.metadata?.userId);
        const packageId = Number(subscription.metadata?.packageId);

        if (userId && packageId) {
          const pkg = await db.query.packages.findFirst({
            where: eq(packages.id, packageId),
          });
          if (pkg) {
            const startsAt = new Date();
            // durationDays counts the start day itself as day 1.
            const endsAt = new Date(
              startsAt.getTime() + (pkg.durationDays - 1) * 24 * 60 * 60 * 1000
            );
            await rolloverUnusedCredits(userId);
            const creditsRemaining = await applyOwedCredits(userId, pkg.credits);
            await db.insert(memberships).values({
              userId,
              packageId,
              status: "active",
              creditsRemaining,
              startsAt,
              endsAt,
              stripeSessionId: invoice.id,
              stripeSubscriptionId: subscriptionId,
              billingType: "recurring",
            });
            await notifyPurchase(userId, pkg);
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
