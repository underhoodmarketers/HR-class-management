"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, packages, users, userLocations, locations } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { stripeFeeCents, DROP_IN_PACKAGE_NAME } from "@/lib/utils";
import { resolvePromoCode } from "@/lib/promoCodes";
import {
  getLocationClassWeekdays,
  nearestMatchingDate,
  computePace,
  resolveAttendanceSlots,
  resolveStartDate,
  type AttendanceSlot,
} from "@/lib/queries";

const MIN_CANCEL_NOTICE_SECONDS = 28 * 24 * 60 * 60; // 4 weeks
const MAX_DROP_IN_QUANTITY = 6;

export type BillingType = "one_time" | "recurring";
export type FriendInvite = { name: string; phone: string; email: string };

export async function validatePromoCode(
  code: string,
  packageId: number
): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  const session = await requireUser();
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    with: { locations: true },
  });
  if (!user) return { ok: false, error: "That code isn't valid." };

  const result = await resolvePromoCode(code, {
    userId: user.id,
    packageId,
    locationIds: user.locations.map((l) => l.locationId),
  });
  if (!result.ok) return result;
  return { ok: true, label: result.label };
}

/**
 * Studios a package can be used at, for the "where will you attend"
 * picker — every active studio if the package has no location
 * restriction (packageLocations has no rows for it), otherwise just the
 * ones it's actually restricted to.
 */
export async function getPackageLocationOptions(
  packageId: number
): Promise<{ id: number; name: string }[]> {
  const pkg = await db.query.packages.findFirst({
    where: eq(packages.id, packageId),
    with: { locations: { with: { location: true } } },
  });
  if (!pkg) return [];
  if (pkg.locations.length > 0) {
    return pkg.locations.map((pl) => ({ id: pl.location.id, name: pl.location.name }));
  }
  const all = await db.query.locations.findMany({ where: eq(locations.active, true) });
  return all.map((l) => ({ id: l.id, name: l.name }));
}

/**
 * A package's weekly class pace and total credits — how many specific
 * weekday slots (across one or two studios) the customer needs to pick so
 * the real end date can be counted correctly. Null for unlimited packages,
 * which have no pace concept.
 */
export async function getPackagePaceInfo(
  packageId: number
): Promise<{ pace: number; totalCredits: number } | null> {
  const pkg = await db.query.packages.findFirst({ where: eq(packages.id, packageId) });
  if (!pkg || pkg.credits === null) return null;
  return { pace: computePace(pkg.credits, pkg.durationDays), totalCredits: pkg.credits };
}

/** Which days of the week a studio actually runs classes on. */
export async function getLocationWeekdays(locationId: number): Promise<number[]> {
  return getLocationClassWeekdays(locationId);
}

/**
 * The nearest upcoming date matching ANY of the chosen attendance slots
 * (which may span two studios) — the default start date once a customer
 * has picked their weekly schedule.
 */
export async function getNearestSlotDate(slots: AttendanceSlot[]): Promise<string | null> {
  const weekdays = [...new Set(slots.map((s) => s.weekday))];
  return nearestMatchingDate(new Date(), weekdays);
}

/**
 * Adds a studio to the customer's preferred studios (a no-op if it's
 * already one) — used by the Drop-In studio picker, which doesn't have a
 * weekly schedule to build like a real package does, so picking a studio
 * there just updates the same preference editable from their profile.
 */
export async function addPreferredLocation(locationId: number): Promise<void> {
  const session = await requireUser();
  const existing = await db.query.userLocations.findFirst({
    where: and(eq(userLocations.userId, session.userId), eq(userLocations.locationId, locationId)),
  });
  if (existing) return;
  await db.insert(userLocations).values({ userId: session.userId, locationId });
}

/**
 * Creates a Stripe Checkout Session in embedded mode and returns its
 * client secret, so the payment form can render inline on our own page
 * instead of redirecting to checkout.stripe.com.
 */
export async function createEmbeddedCheckout(
  packageId: number,
  billingType: BillingType,
  promoCode?: string,
  quantity: number = 1,
  friends: FriendInvite[] = [],
  slots: AttendanceSlot[] = [],
  startDate?: string
): Promise<{ clientSecret: string } | { error: string }> {
  const session = await requireUser();

  const pkg = await db.query.packages.findFirst({
    where: eq(packages.id, packageId),
    with: { locations: true },
  });
  if (!pkg || !pkg.active) return { error: "That package is no longer available." };

  // A chosen weekly schedule + start date is only meaningful for a real
  // package, not a Drop-In (which starts immediately regardless) — both
  // resolve to empty/null for a Drop-In, and each slot is validated for
  // real (studio allowed for this package, weekday it actually runs on)
  // so a tampered request can't smuggle in a fake window.
  const resolvedSlots = await resolveAttendanceSlots(pkg, slots);
  const resolvedStartDate = resolveStartDate(resolvedSlots, startDate);

  if (billingType === "recurring" && (!pkg.recurringPriceCents || !pkg.billingWeeks)) {
    return { error: "Autopay isn't available for that package." };
  }

  // Buying more than one and splitting with friends is only meaningful for
  // the Drop-In package — for everything else, ignore/clamp quantity so a
  // tampered client request can't multiply a subscription or credit pack.
  const isDropIn = pkg.name === DROP_IN_PACKAGE_NAME && billingType === "one_time";
  if (!isDropIn) {
    quantity = 1;
    friends = [];
  } else {
    quantity = Math.min(Math.max(Math.trunc(quantity) || 1, 1), MAX_DROP_IN_QUANTITY);
    friends = friends
      .map((f) => ({ name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim().toLowerCase() }))
      .filter((f) => f.name && f.phone && f.email);
    if (friends.length > quantity - 1) {
      return { error: "You can't invite more friends than Drop-Ins you're buying." };
    }
  }

  if (!stripeConfigured()) {
    return { error: "Payments aren't set up yet. Please contact the studio." };
  }

  let discounts: { promotion_code: string }[] | undefined;
  let appliedPromoCodeId: number | null = null;
  if (promoCode) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
      with: { locations: true },
    });
    const result = await resolvePromoCode(promoCode, {
      userId: session.userId,
      packageId,
      locationIds: user?.locations.map((l) => l.locationId) ?? [],
    });
    if (!result.ok) return { error: result.error };
    discounts = [{ promotion_code: result.stripePromotionCodeId }];
    appliedPromoCodeId = result.promoCodeId;
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const metadata = {
    userId: String(session.userId),
    packageId: String(pkg.id),
    billingType,
    ...(appliedPromoCodeId ? { promoCodeId: String(appliedPromoCodeId) } : {}),
    ...(isDropIn ? { quantity: String(quantity) } : {}),
    ...(isDropIn && friends.length > 0 ? { friends: JSON.stringify(friends) } : {}),
    ...(resolvedSlots.length > 0 ? { slots: JSON.stringify(resolvedSlots) } : {}),
    ...(resolvedStartDate ? { startDate: resolvedStartDate } : {}),
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
              quantity,
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
                unit_amount: stripeFeeCents(pkg.priceCents * quantity),
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

/**
 * Cancels a customer's own autopay subscription, always guaranteeing at
 * least 4 weeks' notice: if the current billing period already ends 4+
 * weeks out, it cancels then (no extra charge); otherwise the subscription
 * keeps billing as scheduled and is set to stop exactly 4 weeks from now.
 */
export async function cancelSubscription(formData: FormData) {
  const session = await requireUser();
  const membershipId = Number(formData.get("membershipId"));
  if (!membershipId) redirect("/portal?error=cancel_invalid");

  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.id, membershipId), eq(memberships.userId, session.userId)),
  });
  if (
    !membership ||
    membership.billingType !== "recurring" ||
    !membership.stripeSubscriptionId ||
    !stripeConfigured()
  ) {
    redirect("/portal?error=cancel_invalid");
  }

  const subscription = await stripe.subscriptions.retrieve(membership.stripeSubscriptionId!);
  if (subscription.status === "canceled" || subscription.cancel_at_period_end || subscription.cancel_at) {
    redirect("/portal?canceled=already");
  }

  const noticeAt = Math.floor(Date.now() / 1000) + MIN_CANCEL_NOTICE_SECONDS;
  if (subscription.current_period_end >= noticeAt) {
    await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
  } else {
    await stripe.subscriptions.update(subscription.id, { cancel_at: noticeAt });
  }

  revalidatePath("/portal");
  redirect("/portal?canceled=1");
}
